'use strict';

// Fixture tests for verify-versions.sh.
// Each test builds a throwaway git repo plus a fake `npm` on PATH, so nothing
// touches the network, the real repo, or the real registry.
//
// Run: node --test .github/scripts/verify-versions.test.cjs

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'verify-versions.sh');
const REAL_GIT = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

let fixtureRoot;
let repoDir;
let npmDir;
let binDir;
let npmLog;

// ---------- fixture helpers ----------

function git(...args) {
  const result = spawnSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args],
    { cwd: repoDir, env: { ...process.env, ...GIT_IDENTITY }, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function writePackage({ dir, project = dir, npmName = `@scope/${dir}`, version, isPrivate }) {
  writeJson(path.join(repoDir, 'packages', dir, 'project.json'), { name: project });
  const manifest = { name: npmName, version };
  if (isPrivate) manifest.private = true;
  writeJson(path.join(repoDir, 'packages', dir, 'package.json'), manifest);
}

function commitAll(message = 'commit') {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

function tag(name) {
  git('tag', '-a', name, '-m', name);
}

function npmFileFor(npmName) {
  return path.join(npmDir, npmName.replace(/\//g, '_'));
}

function npmPublished(npmName, { latest }) {
  writeJson(`${npmFileFor(npmName)}.json`, latest === undefined ? {} : { latest });
}

function npmMissing(npmName) {
  fs.writeFileSync(`${npmFileFor(npmName)}.404`, '');
}

// A package with no npm fixture file behaves like a registry outage.

function installFakeNpm() {
  const script = `#!/bin/sh
# Log and enforce the complete dist-tags-only query contract.
printf '%s\\n' "$*" >> "$FAKE_NPM_LOG"
if [ "$#" -ne 5 ] || [ "$1" != view ] || [ "$3" != dist-tags ] || [ "$4" != --json ] || [ "$5" != --fetch-timeout=10000 ]; then
  echo "unexpected npm query (publication history is forbidden)" >&2
  exit 2
fi
file="$FAKE_NPM_DIR/$(echo "$2" | tr '/' '_')"
if [ -f "$file.404" ]; then echo "npm error code E404" >&2; exit 1; fi
if [ -f "$file.json" ]; then cat "$file.json"; exit 0; fi
echo "npm error code ETIMEDOUT" >&2; exit 1
`;
  const file = path.join(binDir, 'npm');
  fs.writeFileSync(file, script, { mode: 0o755 });
}

function runVerifier(args = [], extraEnv = {}) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_NPM_DIR: npmDir,
      FAKE_NPM_LOG: npmLog,
      VERIFY_REPO_ROOT: repoDir,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  assert.equal(result.signal, null, result.stderr);
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/** One aligned package: disk, tag and npm all say `version`. */
function alignedPackage(dir, version = '1.2.0') {
  writePackage({ dir, version });
  commitAll(`release ${dir}`);
  tag(`${dir}@${version}`);
  npmPublished(`@scope/${dir}`, { latest: version });
}

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-versions-'));
  repoDir = path.join(fixtureRoot, 'repo');
  npmDir = path.join(fixtureRoot, 'npm');
  binDir = path.join(fixtureRoot, 'bin');
  [repoDir, npmDir, binDir].forEach((dir) => fs.mkdirSync(dir));
  git('init', '-q', '-b', 'main');
  npmLog = path.join(fixtureRoot, 'npm-commands.log');
  installFakeNpm();
});

afterEach(() => {
  try {
    if (fs.existsSync(npmLog)) {
      const calls = fs.readFileSync(npmLog, 'utf8').trim().split('\n');
      for (const call of calls) {
        assert.match(call, /^view \S+ dist-tags --json --fetch-timeout=10000$/);
        assert.doesNotMatch(call, /\bversions\b/);
      }
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

// ---------- strict alignment ----------

test('passes when disk, tag and npm latest all match', () => {
  alignedPackage('alpha');
  alignedPackage('beta', '0.4.0');
  const { status, output } = runVerifier();
  assert.equal(status, 0, output);
  assert.match(output, /All package versions are aligned/);
  assert.deepEqual(fs.readFileSync(npmLog, 'utf8').trim().split('\n'), [
    'view @scope/alpha dist-tags --json --fetch-timeout=10000',
    'view @scope/beta dist-tags --json --fetch-timeout=10000',
  ]);
});

test('uses the project name for tags, not the npm name', () => {
  writePackage({ dir: 'lightspeed', project: 'lightspeed-client', npmName: '@scope/lightspeed', version: '0.3.0' });
  commitAll();
  tag('lightspeed-client@0.3.0');
  npmPublished('@scope/lightspeed', { latest: '0.3.0' });
  assert.equal(runVerifier().status, 0);
});

test('fails with NO_TAG when npm has the package but no tag exists', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  npmPublished('@scope/alpha', { latest: '0.1.0' });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /NO_TAG/);
});

test('fails with NEW_PACKAGE when there is no tag and npm returns E404', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  npmMissing('@scope/alpha');
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /NEW_PACKAGE/);
});

test('fails with NOT_ON_NPM when a tag exists but npm returns E404', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  tag('alpha@0.1.0');
  npmMissing('@scope/alpha');
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /NOT_ON_NPM/);
});

test('fails with REGISTRY_ERROR when npm fails for any reason other than E404', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  tag('alpha@0.1.0');
  // no npm fixture file: fake npm reports a timeout
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /REGISTRY_ERROR/);
});

test('does not let one package registry failure hide another mismatch', () => {
  alignedPackage('alpha');
  writePackage({ dir: 'beta', version: '0.2.0' });
  commitAll();
  tag('beta@0.2.0');
  npmPublished('@scope/beta', { latest: '0.1.0' });
  fs.unlinkSync(`${npmFileFor('@scope/alpha')}.json`);
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /REGISTRY_ERROR/);
  assert.match(output, /NPM_LATEST_MISMATCH/);
});

test('fails with PRERELEASE when the manifest version is a prerelease', () => {
  writePackage({ dir: 'alpha', version: '1.0.0-rc.1' });
  commitAll();
  tag('alpha@1.0.0-rc.1');
  npmPublished('@scope/alpha', { latest: '1.0.0-rc.1' });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /PRERELEASE/);
});

test('ignores prerelease and malformed tags when choosing the latest tag', () => {
  alignedPackage('alpha', '1.0.0');
  tag('alpha@1.1.0-rc.1');
  tag('alpha@banana');
  const { status, output } = runVerifier();
  assert.equal(status, 0, output);
});

test('fails with MALFORMED_VERSION when the manifest version is not semver', () => {
  writePackage({ dir: 'alpha', version: 'one.two' });
  commitAll();
  npmPublished('@scope/alpha', { latest: '1.0.0' });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /MALFORMED_VERSION/);
});

test('fails with NPM_UNEXPECTED_LATEST when npm latest is a prerelease', () => {
  writePackage({ dir: 'alpha', version: '1.0.0' });
  commitAll();
  tag('alpha@1.0.0');
  npmPublished('@scope/alpha', { latest: '1.1.0-beta.1' });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /NPM_UNEXPECTED_LATEST/);
});

for (const latest of ['0.1.0', '0.3.0']) {
  test(`fails with NPM_LATEST_MISMATCH when npm latest is ${latest} and disk/tag are 0.2.0`, () => {
    alignedPackage('alpha', '0.2.0');
    npmPublished('@scope/alpha', { latest });
    const { status, output } = runVerifier();
    assert.equal(status, 1, output);
    assert.match(output, /NPM_LATEST_MISMATCH/);
    assert.doesNotMatch(output, /NPM_AHEAD|NPM_BEHIND|LATEST_TAG_BEHIND|unpublished|likely failed|--mode recovery/);
    assert.match(output, /docs\/release-operations\.md/);
  });
}

test('fails with TAG_MISMATCH when the manifest and npm agree but the tag is older', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  tag('alpha@0.1.0');
  writePackage({ dir: 'alpha', version: '0.2.0' });
  commitAll();
  npmPublished('@scope/alpha', { latest: '0.2.0' });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /TAG_MISMATCH/);
});

test('ignores tags that are not reachable from HEAD', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  git('checkout', '-q', '-b', 'side');
  writePackage({ dir: 'alpha', version: '0.2.0' });
  commitAll();
  tag('alpha@0.2.0');
  git('checkout', '-q', 'main');
  tag('alpha@0.1.0');
  npmPublished('@scope/alpha', { latest: '0.1.0' });
  const { status, output } = runVerifier();
  assert.equal(status, 0, output);
});

test('does not match tags of a project whose name shares a prefix', () => {
  alignedPackage('ai-client', '1.0.0');
  writePackage({ dir: 'ai-client-common', version: '3.0.0' });
  commitAll();
  tag('ai-client-common@3.0.0');
  npmPublished('@scope/ai-client-common', { latest: '3.0.0' });
  const { status, output } = runVerifier();
  assert.equal(status, 0, output);
});

test('skips private packages', () => {
  alignedPackage('alpha');
  writePackage({ dir: 'hidden', version: '9.9.9', isPrivate: true });
  commitAll();
  const { status, output } = runVerifier();
  assert.equal(status, 0, output);
  assert.doesNotMatch(output, /hidden/);
});

test('fails with TAG_MANIFEST_MISMATCH when the tag commit holds a different manifest version', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  tag('alpha@0.2.0'); // points at the 0.1.0 commit
  writePackage({ dir: 'alpha', version: '0.2.0' });
  commitAll();
  npmPublished('@scope/alpha', { latest: '0.2.0' });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /TAG_MANIFEST_MISMATCH/);
});

test('rejects project names that could act as glob patterns', () => {
  writePackage({ dir: 'alpha', project: 'al*', version: '1.0.0' });
  commitAll();
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /invalid project name/i);
});

// ---------- removed CLI surface ----------

for (const args of [
  ['--mode', 'strict'], ['--mode', 'recovery'], ['--mode'], ['--mode', 'yolo'],
  ['--require-signed-tags'], ['--grandfathered-tags-file', 'tags.txt'], ['--help'], ['unexpected'],
]) {
  test(`rejects arguments with usage exit 2: ${args.join(' ')}`, () => {
    // Reject usage even without a valid repository/packages directory.
    const { status, output } = runVerifier(args);
    assert.equal(status, 2, output);
    assert.match(output, /Usage: verify-versions\.sh\s*$/m);
    assert.equal(fs.existsSync(npmLog), false);
  });
}

// ---------- fail-closed inputs ----------

function assertFailure(expected, args = [], extraEnv = {}) {
  const { status, output } = runVerifier(args, extraEnv);
  assert.equal(status, 1, output);
  assert.match(output, expected);
  assert.doesNotMatch(output, /All package versions are aligned/);
  return output;
}

function packageFile(name) {
  return path.join(repoDir, 'packages', 'alpha', name);
}

function fakeCommand(name, body) {
  fs.writeFileSync(path.join(binDir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

test('reports missing manifest for an identified project, without hiding another package', () => {
  alignedPackage('beta');
  writeJson(packageFile('project.json'), { name: 'alpha' });
  const output = assertFailure(/MANIFEST_ERROR/);
  assert.match(output, /@scope\/beta.*OK/);
});

test('skips a miscellaneous directory only when neither metadata file exists', () => {
  alignedPackage('alpha');
  fs.mkdirSync(path.join(repoDir, 'packages', 'misc'));
  const { status, output } = runVerifier();
  assert.equal(status, 0, output);
  assert.doesNotMatch(output, /misc/);
});

for (const contents of ['{bad', 'null', '[]', '42']) {
  test(`rejects malformed/non-object manifest: ${contents}`, () => {
    alignedPackage('alpha');
    fs.writeFileSync(packageFile('package.json'), contents);
    assertFailure(/MANIFEST_ERROR/);
  });
}

for (const [field, value] of [
  ['name', undefined], ['name', ''], ['name', 123], ['name', '--registry=evil'],
  ['version', undefined], ['version', ''], ['version', 123], ['private', 'true'],
]) {
  test(`rejects invalid manifest ${field}: ${JSON.stringify(value)}`, () => {
    alignedPackage('alpha');
    writeJson(packageFile('package.json'), { name: '@scope/alpha', version: '1.2.0', [field]: value });
    assertFailure(/MANIFEST_ERROR/);
  });
}

test('rejects unreadable manifest (a directory instead of a file)', () => {
  alignedPackage('alpha');
  fs.unlinkSync(packageFile('package.json'));
  fs.mkdirSync(packageFile('package.json'));
  assertFailure(/MANIFEST_ERROR/);
});

test('rejects missing project metadata for a public manifest', () => {
  alignedPackage('alpha');
  fs.unlinkSync(packageFile('project.json'));
  assertFailure(/INVALID_PROJECT_NAME/);
});

for (const contents of ['{bad', 'null', '[]', '{}', '{"name":123}', '{"name":""}']) {
  test(`rejects invalid public project metadata: ${contents}`, () => {
    alignedPackage('alpha');
    fs.writeFileSync(packageFile('project.json'), contents);
    assertFailure(/INVALID_PROJECT_NAME/);
  });
}

test('rejects unreadable project metadata (a directory instead of a file)', () => {
  alignedPackage('alpha');
  fs.unlinkSync(packageFile('project.json'));
  fs.mkdirSync(packageFile('project.json'));
  assertFailure(/INVALID_PROJECT_NAME/);
});

test('private package skipping does not require public identity or project metadata', () => {
  alignedPackage('alpha');
  writeJson(path.join(repoDir, 'packages', 'hidden', 'package.json'), { private: true });
  assert.equal(runVerifier().status, 0);
});

test('rejects a missing packages root', () => {
  assertFailure(/could not discover package directories/);
});

test('rejects a packages root that is not a directory', () => {
  fs.writeFileSync(path.join(repoDir, 'packages'), 'not a directory');
  assertFailure(/could not discover package directories/);
});

test('rejects empty package discovery', () => {
  fs.mkdirSync(path.join(repoDir, 'packages'));
  assertFailure(/no package directories found/);
});

test('rejects a discovered set containing only private/miscellaneous directories', () => {
  writePackage({ dir: 'hidden', version: '1.0.0', isPrivate: true });
  fs.mkdirSync(path.join(repoDir, 'packages', 'misc'));
  assertFailure(/no public projects found/);
});

test('rejects partial package discovery even when stdout contains an aligned package', () => {
  alignedPackage('alpha');
  fakeCommand('find', 'printf "%s\\n" "$VERIFY_REPO_ROOT/packages/alpha"; exit 1');
  assertFailure(/could not discover package directories/);
  assert.equal(fs.existsSync(npmLog), false);
});

for (const contents of ['{bad', 'null', '[]', '"1.2.0"', '42', '{"latest":null}', '{"latest":123}', '{"latest":{}}', '{"latest":[]}']) {
  test(`rejects invalid npm metadata as REGISTRY_ERROR: ${contents}`, () => {
    alignedPackage('alpha');
    fs.writeFileSync(`${npmFileFor('@scope/alpha')}.json`, contents);
    assertFailure(/REGISTRY_ERROR/);
  });
}

for (const metadata of [{}, { next: '1.2.0' }, { latest: '' }, { latest: 'banana' }]) {
  test(`rejects missing/nonstable latest as NPM_UNEXPECTED_LATEST: ${JSON.stringify(metadata)}`, () => {
    alignedPackage('alpha');
    writeJson(`${npmFileFor('@scope/alpha')}.json`, metadata);
    assertFailure(/NPM_UNEXPECTED_LATEST/);
  });
}

test('rejects a nonzero npm lookup even with plausible aligned stdout', () => {
  alignedPackage('alpha');
  fs.writeFileSync(path.join(binDir, 'npm'), fs.readFileSync(path.join(binDir, 'npm'), 'utf8')
    .replace('cat "$file.json"; exit 0', 'cat "$file.json"; exit 1'));
  assertFailure(/REGISTRY_ERROR/);
});

test('preserves E404 handling when the error is in stdout', () => {
  writePackage({ dir: 'alpha', version: '1.2.0' });
  commitAll();
  fakeCommand('npm', 'echo "npm error code E404"; exit 1');
  assertFailure(/NEW_PACKAGE/);
});

test('rejects failed Git tag enumeration even with a plausible aligned tag on stdout', () => {
  alignedPackage('alpha');
  fakeCommand('git', 'echo "alpha@1.2.0"; exit 1');
  assertFailure(/could not enumerate reachable tags/);
});

test('rejects failed tagged-manifest read even with plausible aligned JSON on stdout', () => {
  alignedPackage('alpha');
  fakeCommand('git', `if [ "$3" = show ]; then echo '{"version":"1.2.0"}'; exit 1; fi
exec "${REAL_GIT}" "$@"`);
  assertFailure(/TAG_MANIFEST_MISMATCH/);
});

test('rejects a tagged commit without the package manifest', () => {
  writeJson(packageFile('project.json'), { name: 'alpha' });
  commitAll();
  tag('alpha@1.2.0');
  writePackage({ dir: 'alpha', version: '1.2.0' });
  commitAll();
  npmPublished('@scope/alpha', { latest: '1.2.0' });
  assertFailure(/TAG_MANIFEST_MISMATCH/);
});

for (const contents of ['{bad', '{}', '{"version":123}']) {
  test(`rejects invalid tagged manifest: ${contents}`, () => {
    writePackage({ dir: 'alpha', version: '1.2.0' });
    fs.writeFileSync(packageFile('package.json'), contents);
    commitAll();
    tag('alpha@1.2.0');
    writePackage({ dir: 'alpha', version: '1.2.0' });
    commitAll();
    npmPublished('@scope/alpha', { latest: '1.2.0' });
    assertFailure(/TAG_MANIFEST_MISMATCH/);
  });
}

test('counts general mismatch when disk, tag and npm are all different', () => {
  alignedPackage('alpha', '1.0.0');
  writePackage({ dir: 'alpha', version: '2.0.0' });
  npmPublished('@scope/alpha', { latest: '3.0.0' });
  assertFailure(/✗ MISMATCH/);
});

// Plausible parser stdout cannot override its failing exit status.
for (const [field, expected] of [
  ['latest', /REGISTRY_ERROR/],
  ['version', /TAG_MANIFEST_MISMATCH/],
]) {
  test(`rejects failed JSON parser with aligned stdout for ${field}`, () => {
    alignedPackage('alpha');
    fakeCommand('node', `if [ "$3" = "-" ] && [ "$4" = "${field}" ]; then printf '1.2.0'; exit 1; fi
exec "${process.execPath}" "$@"`);
    assertFailure(expected);
  });
}

test('selects the greatest reachable stable version numerically', () => {
  alignedPackage('alpha', '1.10.0');
  tag('alpha@1.9.0');
  assert.equal(runVerifier().status, 0);
});

test('initializes reporting fields for each invalid manifest', () => {
  alignedPackage('alpha');
  writeJson(path.join(repoDir, 'packages', 'beta', 'project.json'), { name: 'beta' });
  fs.writeFileSync(path.join(repoDir, 'packages', 'beta', 'package.json'), '{bad');
  const output = assertFailure(/MANIFEST_ERROR/);
  assert.match(output, /packages\/beta\s+-\s+-\s+-\s+✗ MANIFEST_ERROR/);
  assert.match(output, /FAILED \(1 project\(s\)\)/);
});

for (const [file, expected] of [
  ['packages', /could not discover package directories/],
  ['packages/alpha', /could not read discovered package directory/],
  ['packages/alpha/package.json', /MANIFEST_ERROR/],
  ['packages/alpha/project.json', /INVALID_PROJECT_NAME/],
]) {
  test(`rejects unreadable input: ${file}`, { skip: process.getuid() === 0 && 'root can read mode-000 files' }, () => {
    alignedPackage('alpha');
    const target = path.join(repoDir, file);
    const mode = fs.statSync(target).mode;
    fs.chmodSync(target, 0);
    try {
      assertFailure(expected);
    } finally {
      fs.chmodSync(target, mode);
    }
  });
}
