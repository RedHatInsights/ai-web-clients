'use strict';

// Fixture tests for verify-versions.sh: a throwaway git repo plus a fake `npm` on PATH.
// Run: node --test .github/scripts/verify-versions.test.cjs

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'verify-versions.sh');
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

function git(...args) {
  const result = spawnSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args],
    { cwd: repoDir, env: { ...process.env, ...GIT_IDENTITY }, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function writePackage({ dir, project = dir, version, isPrivate }) {
  writeJson(path.join(repoDir, 'packages', dir, 'project.json'), { name: project });
  const manifest = { name: `@scope/${dir}`, version };
  if (isPrivate) manifest.private = true;
  writeJson(path.join(repoDir, 'packages', dir, 'package.json'), manifest);
}

function commitAll() {
  git('add', '-A');
  git('commit', '-q', '-m', 'commit');
}

function tag(name) {
  git('tag', '-a', name, '-m', name);
}

// A package without a published fixture behaves like an unpublished package or outage.
function npmPublished(dir, latest) {
  fs.writeFileSync(path.join(npmDir, `@scope_${dir}`), latest);
}

function installFakeNpm() {
  const script = `#!/bin/sh
file="$FAKE_NPM_DIR/$(echo "$2" | tr '/' '_')"
[ -f "$file" ] && cat "$file" && exit 0
echo "npm error code E404" >&2
exit 1
`;
  fs.writeFileSync(path.join(binDir, 'npm'), script, { mode: 0o755 });
}

function runVerifier() {
  const result = spawnSync('bash', [SCRIPT], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_NPM_DIR: npmDir,
      VERIFY_REPO_ROOT: repoDir,
    },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/** One released package: disk, tag and npm all say `version`. */
function alignedPackage(dir, version = '1.2.0') {
  writePackage({ dir, version });
  commitAll();
  tag(`${dir}@${version}`);
  npmPublished(dir, version);
}

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-versions-'));
  repoDir = path.join(fixtureRoot, 'repo');
  npmDir = path.join(fixtureRoot, 'npm');
  binDir = path.join(fixtureRoot, 'bin');
  [repoDir, npmDir, binDir].forEach((dir) => fs.mkdirSync(dir));
  git('init', '-q', '-b', 'main');
  installFakeNpm();
});

afterEach(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('passes when disk, tag and npm latest all match', () => {
  alignedPackage('alpha');
  alignedPackage('beta', '0.4.0');
  assert.equal(runVerifier().status, 0);
});

test('fails when the latest tag differs from disk and npm', () => {
  alignedPackage('alpha', '1.2.0');
  writePackage({ dir: 'alpha', version: '1.3.0' });
  commitAll();
  npmPublished('alpha', '1.3.0');
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /alpha versions disagree/);
});

test('passes with a warning when npm lags a tagged version', () => {
  alignedPackage('alpha');
  npmPublished('alpha', '1.1.0');
  const { status, output } = runVerifier();
  assert.equal(status, 0);
  assert.match(output, /alpha@1\.2\.0 is tagged but not published/);
});

test('fails when npm latest is ahead of disk and tag', () => {
  alignedPackage('alpha');
  npmPublished('alpha', '1.3.0');
  assert.equal(runVerifier().status, 1);
});

test('fails when the manifest at the tagged commit differs from the tag', () => {
  writePackage({ dir: 'alpha', version: '1.1.0' });
  commitAll();
  tag('alpha@1.2.0');
  writePackage({ dir: 'alpha', version: '1.2.0' });
  commitAll();
  npmPublished('alpha', '1.2.0');
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /alpha manifest at alpha@1\.2\.0 says 1\.1\.0/);
});

test('fails when no tag exists', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  npmPublished('alpha', '0.1.0');
  assert.equal(runVerifier().status, 1);
});

test('fails when the package is not published', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  tag('alpha@0.1.0');
  assert.equal(runVerifier().status, 1);
});

test('reports the npm column as ERROR when the registry lookup fails', () => {
  alignedPackage('alpha');
  fs.rmSync(path.join(npmDir, '@scope_alpha'));
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /ERROR/);
});

test('skips private packages', () => {
  alignedPackage('alpha');
  writePackage({ dir: 'internal', version: '0.0.1', isPrivate: true });
  commitAll();
  assert.equal(runVerifier().status, 0);
});

test('does not match tags of a project whose name shares a prefix', () => {
  alignedPackage('alpha');
  tag('alpha-extra@9.9.9');
  assert.equal(runVerifier().status, 0);
});

test('ignores tags not reachable from HEAD', () => {
  alignedPackage('alpha');
  git('checkout', '-q', '-b', 'side');
  writePackage({ dir: 'alpha', version: '9.9.9' });
  commitAll();
  tag('alpha@9.9.9');
  git('checkout', '-q', 'main');
  assert.equal(runVerifier().status, 0);
});

test('selects the greatest stable tag numerically', () => {
  writePackage({ dir: 'alpha', version: '1.10.0' });
  commitAll();
  tag('alpha@1.9.0');
  tag('alpha@1.10.0');
  npmPublished('alpha', '1.10.0');
  assert.equal(runVerifier().status, 0);
});
