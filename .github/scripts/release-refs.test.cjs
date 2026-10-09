'use strict';

// Run: node --test .github/scripts/release-refs.test.cjs
//
// Fixture tests for release-refs.sh. Each test builds a bare "origin" remote and a working
// clone in a temporary directory, with a throwaway GPG key. Nothing here reaches npm or GitHub.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'release-refs.sh');
const hasGpg = spawnSync('gpg', ['--version']).status === 0;

let gnupgHome;
let fingerprint;
const cleanups = [];

const baseEnv = () => ({
  PATH: process.env.PATH,
  HOME: gnupgHome,
  GNUPGHOME: gnupgHome,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
});

function exec(cwd, command, args, env = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...baseEnv(), ...env } });
  if (result.error) throw result.error;
  return result;
}

function git(cwd, ...args) {
  const result = exec(cwd, 'git', args);
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

const releaseRefs = (cwd, args, env) => exec(cwd, 'bash', [SCRIPT, ...args], env);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeProject(work, version) {
  writeJson(path.join(work, 'packages/alpha/package.json'), { name: '@scope/alpha', version });
  writeJson(path.join(work, 'dist/packages/alpha/package.json'), { name: '@scope/alpha', version });
  fs.mkdirSync(path.join(work, 'dist/packages/alpha/src'), { recursive: true });
  fs.writeFileSync(path.join(work, 'dist/packages/alpha/src/index.js'), '');
}

function configureSigning(work) {
  git(work, 'config', 'user.name', 'Release Bot');
  git(work, 'config', 'user.email', 'bot@example.com');
  git(work, 'config', 'user.signingkey', fingerprint);
  git(work, 'config', 'commit.gpgsign', 'true');
  git(work, 'config', 'tag.gpgsign', 'true');
}

/** A bare origin plus a signed working clone with one baseline release alpha@1.0.0 on main. */
function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relrefs-'));
  const remote = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', remote);
  git(root, 'clone', remote, work);
  configureSigning(work);
  writeProject(work, '1.0.0');
  fs.writeFileSync(path.join(work, '.gitignore'), 'dist\n');
  git(work, 'add', '.');
  git(work, 'commit', '-m', 'feat(alpha): first release');
  git(work, 'tag', '-a', 'alpha@1.0.0', '-m', 'alpha@1.0.0');
  git(work, 'push', 'origin', 'HEAD:refs/heads/main', 'refs/tags/alpha@1.0.0');
  const snapshotFile = path.join(root, 'tags-before.txt');
  const fixture = {
    root,
    remote,
    work,
    snapshotFile,
    base: git(work, 'rev-parse', 'HEAD'),
    snapshot: () => assert.equal(releaseRefs(work, ['snapshot-tags', snapshotFile]).status, 0),
  };
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  return fixture;
}

/** Imitates what `nx release --skip-publish` leaves behind. */
function simulateRelease(fixture, options = {}) {
  const { version = '1.1.0', signCommit = true, signTag = true, annotated = true, tag = `alpha@${version}`, sourceVersion = version, distVersion = version } = options;
  const { work } = fixture;
  writeJson(path.join(work, 'packages/alpha/package.json'), { name: '@scope/alpha', version: sourceVersion });
  writeJson(path.join(work, 'dist/packages/alpha/package.json'), { name: '@scope/alpha', version: distVersion });
  git(work, 'add', 'packages');
  git(work, '-c', `commit.gpgsign=${signCommit}`, 'commit', '-m', 'chore(versions): package.json version sync + changelog [skip ci]');
  const tagArgs = annotated ? ['-a', tag, '-m', tag] : [tag];
  git(work, '-c', `tag.gpgsign=${signTag && annotated}`, 'tag', ...tagArgs);
}

function advanceRemote(fixture) {
  const other = path.join(fixture.root, 'other');
  git(fixture.root, 'clone', fixture.remote, other);
  configureSigning(other);
  git(other, 'commit', '--allow-empty', '-m', 'feat(alpha): merged while releasing');
  git(other, 'push', 'origin', 'HEAD:refs/heads/main');
  return git(other, 'rev-parse', 'HEAD');
}

const remoteRef = (fixture, ref) => git(fixture.root, '--git-dir', fixture.remote, 'rev-parse', '--verify', '--quiet', ref).trim();
const remoteHasRef = (fixture, ref) => exec(fixture.root, 'git', ['--git-dir', fixture.remote, 'rev-parse', '--verify', '--quiet', ref]).status === 0;

before(() => {
  if (!hasGpg) return;
  gnupgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gpg-'));
  fs.chmodSync(gnupgHome, 0o700);
  const generated = exec(gnupgHome, 'gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', '', '--quick-generate-key', 'Release Bot <bot@example.com>', 'ed25519', 'sign', 'never']);
  assert.equal(generated.status, 0, generated.stderr);
  const listing = exec(gnupgHome, 'gpg', ['--list-secret-keys', '--with-colons']).stdout;
  fingerprint = listing.split('\n').find((line) => line.startsWith('fpr:')).split(':')[9];
});

after(() => {
  cleanups.forEach((cleanup) => cleanup());
  if (!hasGpg || !gnupgHome) return;
  exec(gnupgHome, 'gpgconf', ['--kill', 'gpg-agent']);
  fs.rmSync(gnupgHome, { recursive: true, force: true });
});

const gpgTest = (name, run) => test(name, { skip: !hasGpg && 'gpg is not installed' }, run);

describe('check-origin', () => {
  const originCheck = (url, expected = 'RedHatInsights/ai-web-clients') => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relrefs-origin-'));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', url);
    return releaseRefs(dir, ['check-origin', expected]);
  };

  test('accepts https, ssh and .git forms of the upstream repository', () => {
    for (const url of [
      'https://github.com/RedHatInsights/ai-web-clients',
      'https://github.com/RedHatInsights/ai-web-clients.git',
      'https://x-access-token:secret@github.com/RedHatInsights/ai-web-clients.git',
      'git@github.com:RedHatInsights/ai-web-clients.git',
      'ssh://git@github.com/RedHatInsights/ai-web-clients.git',
    ]) {
      assert.equal(originCheck(url).status, 0, url);
    }
  });

  test('rejects a developer fork', () => {
    const result = originCheck('https://github.com/chmulder-rh/ai-web-clients.git');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /expected RedHatInsights\/ai-web-clients/);
  });

  test('rejects a non GitHub remote', () => {
    assert.equal(originCheck('/tmp/some/local/path').status, 1);
  });
});

describe('fast-forward', () => {
  const fastForward = (fixture) => releaseRefs(fixture.work, ['fast-forward', 'origin', 'main']);

  gpgTest('does nothing when HEAD is already the remote tip', () => {
    const fixture = createFixture();
    assert.equal(fastForward(fixture).status, 0);
    assert.equal(git(fixture.work, 'rev-parse', 'HEAD'), fixture.base);
  });

  gpgTest('moves HEAD to the tip when main advanced while the run waited', () => {
    const fixture = createFixture();
    const advanced = advanceRemote(fixture);
    git(fixture.work, 'checkout', '--detach', fixture.base);
    const result = fastForward(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(fixture.work, 'rev-parse', 'HEAD'), advanced);
  });

  gpgTest('fails when history was rewritten', () => {
    const fixture = createFixture();
    git(fixture.work, 'commit', '--allow-empty', '-m', 'chore: local only');
    advanceRemote(fixture);
    const result = fastForward(fixture);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot fast-forward/);
  });
});

describe('configure-signing', () => {
  gpgTest('imports the key and configures signing for the repository', () => {
    const fixture = createFixture();
    const exported = exec(fixture.root, 'gpg', ['--armor', '--export-secret-keys', fingerprint]);
    assert.equal(exported.status, 0);
    const privateKey = spawnSync('base64', ['-w0'], { input: exported.stdout, encoding: 'utf8' }).stdout;
    const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gpg-'));
    fs.chmodSync(freshHome, 0o700);
    cleanups.push(() => {
      exec(freshHome, 'gpgconf', ['--kill', 'gpg-agent'], { GNUPGHOME: freshHome });
      fs.rmSync(freshHome, { recursive: true, force: true });
    });
    const clone = path.join(fixture.root, 'bot-clone');
    git(fixture.root, 'clone', fixture.remote, clone);

    const env = { GNUPGHOME: freshHome, GPG_PRIVATE_KEY: privateKey, GIT_USER_NAME: 'Bot', GIT_USER_EMAIL: 'bot@example.com' };
    const result = releaseRefs(clone, ['configure-signing'], env);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(clone, 'config', 'user.signingkey'), fingerprint);
    assert.equal(git(clone, 'config', 'commit.gpgsign'), 'true');
    assert.equal(git(clone, 'config', 'tag.gpgsign'), 'true');
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(privateKey.slice(0, 40)));
    const signed = exec(clone, 'git', ['commit', '--allow-empty', '-m', 'chore: signed'], { GNUPGHOME: freshHome });
    assert.equal(signed.status, 0, signed.stderr);
    assert.equal(exec(clone, 'git', ['verify-commit', 'HEAD'], { GNUPGHOME: freshHome }).status, 0);
  });

  test('fails without the key', () => {
    const result = releaseRefs(os.tmpdir(), ['configure-signing'], { GIT_USER_NAME: 'Bot', GIT_USER_EMAIL: 'bot@example.com' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /GPG_PRIVATE_KEY is required/);
  });
});

describe('release-state', () => {
  gpgTest('none when nothing changed (a chore merge)', () => {
    const fixture = createFixture();
    fixture.snapshot();
    const result = releaseRefs(fixture.work, ['release-state', fixture.base, fixture.snapshotFile]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'none');
  });

  gpgTest('none, with a warning, when HEAD moved but no tag was created (lockfile-only commit)', () => {
    const fixture = createFixture();
    fixture.snapshot();
    git(fixture.work, 'commit', '--allow-empty', '-m', 'chore(versions): package.json version sync + changelog [skip ci]');
    const result = releaseRefs(fixture.work, ['release-state', fixture.base, fixture.snapshotFile]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'none');
    assert.match(result.stderr, /WARNING: HEAD moved/);
  });

  gpgTest('release when a commit and new tags exist', () => {
    const fixture = createFixture();
    fixture.snapshot();
    simulateRelease(fixture);
    const result = releaseRefs(fixture.work, ['release-state', fixture.base, fixture.snapshotFile]);
    assert.equal(result.stdout.trim(), 'release');
  });

  gpgTest('fails when tags exist but HEAD did not move', () => {
    const fixture = createFixture();
    fixture.snapshot();
    git(fixture.work, 'tag', '-a', 'alpha@1.1.0', '-m', 'stray');
    assert.equal(releaseRefs(fixture.work, ['release-state', fixture.base, fixture.snapshotFile]).status, 1);
  });

  gpgTest('fails when an existing tag was moved', () => {
    const fixture = createFixture();
    fixture.snapshot();
    git(fixture.work, 'commit', '--allow-empty', '-m', 'chore: x');
    git(fixture.work, 'tag', '-f', '-a', 'alpha@1.0.0', '-m', 'moved');
    const result = releaseRefs(fixture.work, ['release-state', fixture.base, fixture.snapshotFile]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /moved or deleted/);
  });

  gpgTest('fails when an existing tag was deleted', () => {
    const fixture = createFixture();
    fixture.snapshot();
    git(fixture.work, 'tag', '-d', 'alpha@1.0.0');
    assert.equal(releaseRefs(fixture.work, ['release-state', fixture.base, fixture.snapshotFile]).status, 1);
  });
});

describe('validate-release', () => {
  const validate = (fixture) => releaseRefs(fixture.work, ['validate-release', fixture.base, fixture.snapshotFile]);

  const released = (options) => {
    const fixture = createFixture();
    fixture.snapshot();
    simulateRelease(fixture, options);
    return fixture;
  };

  gpgTest('accepts a signed commit and signed annotated tags that match the manifests', () => {
    const result = validate(released());
    assert.equal(result.status, 0, result.stderr);
  });

  gpgTest('rejects an unsigned release commit', () => {
    const result = validate(released({ signCommit: false }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HEAD has no valid signature/);
  });

  gpgTest('rejects an unsigned tag', () => {
    const result = validate(released({ signTag: false }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /alpha@1\.1\.0 has no valid signature/);
  });

  gpgTest('rejects a lightweight tag', () => {
    const result = validate(released({ annotated: false }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not an annotated tag/);
  });

  gpgTest('rejects a tag that is not on the release commit', () => {
    const fixture = released();
    git(fixture.work, 'tag', '-d', 'alpha@1.1.0');
    git(fixture.work, 'tag', '-a', 'alpha@1.1.0', '-m', 'old', fixture.base);
    const result = validate(fixture);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not point at the release commit/);
  });

  gpgTest('rejects a source manifest that disagrees with the tag', () => {
    const result = validate(released({ sourceVersion: '1.0.5' }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packages\/alpha\/package\.json is at 1\.0\.5/);
  });

  gpgTest('rejects a dist manifest that disagrees with the tag', () => {
    const result = validate(released({ distVersion: '1.0.0' }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /dist\/packages\/alpha\/package\.json is at 1\.0\.0/);
  });

  gpgTest('rejects missing built output', () => {
    const fixture = released();
    fs.rmSync(path.join(fixture.work, 'dist/packages/alpha/src/index.js'));
    assert.match(validate(fixture).stderr, /index\.js is missing/);
  });

  gpgTest('rejects an unexpected tag name created during the run', () => {
    const fixture = released();
    git(fixture.work, 'tag', '-a', 'last-release', '-m', 'moving tag');
    const result = validate(fixture);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected tag created: refs\/tags\/last-release/);
  });

  gpgTest('rejects a prerelease tag', () => {
    const result = validate(released({ version: '1.1.0-beta.1' }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected tag created/);
  });

  gpgTest('rejects more than one commit since the baseline', () => {
    const fixture = released();
    git(fixture.work, 'commit', '--allow-empty', '-m', 'chore: extra');
    assert.match(validate(fixture).stderr, /exactly one release commit/);
  });

  gpgTest('rejects a dirty working tree', () => {
    const fixture = released();
    fs.writeFileSync(path.join(fixture.work, 'package-lock.json'), '{}\n');
    assert.match(validate(fixture).stderr, /working tree is not clean/);
  });

  gpgTest('ignores unrelated tags that already existed before the run', () => {
    const fixture = createFixture();
    git(fixture.work, 'tag', '-a', 'scratch-note', '-m', 'local only, unsigned');
    fixture.snapshot();
    simulateRelease(fixture);
    assert.equal(validate(fixture).status, 0);
  });
});

describe('push-release', () => {
  const push = (fixture) => releaseRefs(fixture.work, ['push-release', 'origin', fixture.snapshotFile]);

  gpgTest('pushes the release commit and only the new tags', () => {
    const fixture = createFixture();
    git(fixture.work, 'tag', '-a', 'scratch-note', '-m', 'local only');
    fixture.snapshot();
    simulateRelease(fixture);
    const head = git(fixture.work, 'rev-parse', 'HEAD');

    const result = push(fixture);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(remoteRef(fixture, 'refs/heads/main'), head);
    assert.ok(remoteHasRef(fixture, 'refs/tags/alpha@1.1.0'));
    assert.equal(remoteHasRef(fixture, 'refs/tags/scratch-note'), false);
  });

  gpgTest('pushes several tags in one atomic update', () => {
    const fixture = createFixture();
    fixture.snapshot();
    simulateRelease(fixture);
    git(fixture.work, 'tag', '-a', 'beta@0.2.0', '-m', 'beta@0.2.0');
    assert.equal(push(fixture).status, 0);
    assert.ok(remoteHasRef(fixture, 'refs/tags/alpha@1.1.0'));
    assert.ok(remoteHasRef(fixture, 'refs/tags/beta@0.2.0'));
  });

  gpgTest('a stale local main is rejected as a whole: no branch update and no tags', () => {
    const fixture = createFixture();
    fixture.snapshot();
    simulateRelease(fixture);
    const advanced = advanceRemote(fixture);

    const result = push(fixture);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /atomic push was rejected; nothing was published/);
    assert.equal(remoteRef(fixture, 'refs/heads/main'), advanced);
    assert.equal(remoteHasRef(fixture, 'refs/tags/alpha@1.1.0'), false);
  });

  gpgTest('a remote that rejects one ref rejects all of them', () => {
    const fixture = createFixture();
    fixture.snapshot();
    simulateRelease(fixture);
    const hook = path.join(fixture.remote, 'hooks/pre-receive');
    fs.writeFileSync(hook, '#!/bin/sh\nwhile read old new ref; do case "$ref" in refs/tags/*) exit 1;; esac; done\n', { mode: 0o755 });

    const result = push(fixture);

    assert.equal(result.status, 1);
    assert.equal(remoteRef(fixture, 'refs/heads/main'), fixture.base);
  });

  gpgTest('refuses to push an unexpected new tag', () => {
    const fixture = createFixture();
    fixture.snapshot();
    simulateRelease(fixture);
    git(fixture.work, 'tag', '-a', 'last-release', '-m', 'moving tag');
    const result = push(fixture);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to push unexpected tag/);
    assert.equal(remoteRef(fixture, 'refs/heads/main'), fixture.base);
  });

  gpgTest('refuses when there is nothing new to push', () => {
    const fixture = createFixture();
    fixture.snapshot();
    const result = push(fixture);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no new tags to push/);
  });
});

describe('usage', () => {
  test('unknown command is a usage error', () => {
    assert.equal(releaseRefs(os.tmpdir(), ['nope']).status, 2);
  });

  test('missing arguments are a usage error', () => {
    assert.equal(releaseRefs(os.tmpdir(), ['release-state', 'abc']).status, 2);
  });
});
