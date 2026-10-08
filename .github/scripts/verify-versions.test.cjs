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

function npmPublished(npmName, { latest, versions = [latest] }) {
  writeJson(`${npmFileFor(npmName)}.json`, {
    versions,
    'dist-tags': latest ? { latest } : {},
  });
}

function npmMissing(npmName) {
  fs.writeFileSync(`${npmFileFor(npmName)}.404`, '');
}

// A package with no npm fixture file behaves like a registry outage.

function installFakeNpm() {
  const script = `#!/bin/sh
# invoked as: npm view <package> versions dist-tags --json ...
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
      VERIFY_REPO_ROOT: repoDir,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
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
  installFakeNpm();
});

afterEach(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

// ---------- strict mode ----------

test('passes when disk, tag and npm latest all match', () => {
  alignedPackage('alpha');
  alignedPackage('beta', '0.4.0');
  const { status, output } = runVerifier();
  assert.equal(status, 0, output);
  assert.match(output, /All package versions are aligned/);
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
  assert.match(output, /NPM_BEHIND/);
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
  npmPublished('@scope/alpha', { latest: '1.1.0-beta.1', versions: ['1.0.0', '1.1.0-beta.1'] });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /NPM_UNEXPECTED_LATEST/);
});

test('fails with NPM_BEHIND when git is ahead of npm', () => {
  writePackage({ dir: 'alpha', version: '0.2.0' });
  commitAll();
  tag('alpha@0.2.0');
  npmPublished('@scope/alpha', { latest: '0.1.0' });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /NPM_BEHIND/);
});

test('fails with NPM_AHEAD when npm is ahead of git and disk', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  tag('alpha@0.1.0');
  npmPublished('@scope/alpha', { latest: '0.2.0', versions: ['0.1.0', '0.2.0'] });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /NPM_AHEAD/);
});

test('fails with LATEST_TAG_BEHIND when the version is published but latest points elsewhere', () => {
  writePackage({ dir: 'alpha', version: '0.2.0' });
  commitAll();
  tag('alpha@0.2.0');
  npmPublished('@scope/alpha', { latest: '0.1.0', versions: ['0.1.0', '0.2.0'] });
  const { status, output } = runVerifier();
  assert.equal(status, 1);
  assert.match(output, /LATEST_TAG_BEHIND/);
});

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

// ---------- signed tag policy ----------

test('--require-signed-tags rejects an unsigned tag that is not grandfathered', () => {
  alignedPackage('alpha');
  const { status, output } = runVerifier(['--require-signed-tags']);
  assert.equal(status, 1);
  assert.match(output, /TAG_UNSIGNED/);
});

test('--require-signed-tags accepts an unsigned tag listed in the grandfather file', () => {
  alignedPackage('alpha');
  const file = path.join(fixtureRoot, 'grandfathered.txt');
  fs.writeFileSync(file, '# historical tags\nalpha@1.2.0\n');
  const { status, output } = runVerifier(['--require-signed-tags'], { GRANDFATHERED_TAGS_FILE: file });
  assert.equal(status, 0, output);
});

test('grandfathering is exact: a different tag on the same project is not covered', () => {
  alignedPackage('alpha');
  const file = path.join(fixtureRoot, 'grandfathered.txt');
  fs.writeFileSync(file, 'alpha@1.1.0\nalpha@1.2\n');
  const { status, output } = runVerifier(['--require-signed-tags'], { GRANDFATHERED_TAGS_FILE: file });
  assert.equal(status, 1);
  assert.match(output, /TAG_UNSIGNED/);
});

// ---------- recovery mode ----------

test('recovery mode accepts git ahead of npm and names the packages to publish', () => {
  alignedPackage('alpha');
  writePackage({ dir: 'beta', version: '0.2.0' });
  commitAll();
  tag('beta@0.2.0');
  npmPublished('@scope/beta', { latest: '0.1.0' });
  const { status, output } = runVerifier(['--mode', 'recovery']);
  assert.equal(status, 0, output);
  assert.match(output, /Packages behind on npm: @scope\/beta@0\.2\.0/);
});

test('recovery mode still rejects npm ahead of git', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  tag('alpha@0.1.0');
  npmPublished('@scope/alpha', { latest: '0.2.0', versions: ['0.1.0', '0.2.0'] });
  assert.equal(runVerifier(['--mode', 'recovery']).status, 1);
});

test('recovery mode still rejects a missing tag', () => {
  writePackage({ dir: 'alpha', version: '0.1.0' });
  commitAll();
  npmPublished('@scope/alpha', { latest: '0.0.9' });
  assert.equal(runVerifier(['--mode', 'recovery']).status, 1);
});

test('recovery mode still rejects registry errors and tag/manifest mismatches', () => {
  writePackage({ dir: 'alpha', version: '0.2.0' });
  commitAll();
  tag('alpha@0.2.0');
  assert.equal(runVerifier(['--mode', 'recovery']).status, 1); // registry error

  npmPublished('@scope/alpha', { latest: '0.1.0' });
  git('tag', '-d', 'alpha@0.2.0');
  tag('alpha@0.3.0'); // tag ahead of manifest
  assert.equal(runVerifier(['--mode', 'recovery']).status, 1);
});

test('strict mode is the default and refuses the npm-behind state recovery allows', () => {
  writePackage({ dir: 'alpha', version: '0.2.0' });
  commitAll();
  tag('alpha@0.2.0');
  npmPublished('@scope/alpha', { latest: '0.1.0' });
  assert.equal(runVerifier().status, 1);
  assert.equal(runVerifier(['--mode', 'strict']).status, 1);
});

test('rejects an unknown mode', () => {
  alignedPackage('alpha');
  const { status, output } = runVerifier(['--mode', 'yolo']);
  assert.equal(status, 2);
  assert.match(output, /Unknown mode/);
});
