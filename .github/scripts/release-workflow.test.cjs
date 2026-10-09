'use strict';

// Run: node --test .github/scripts/release-workflow.test.cjs
//
// Static checks on .github/workflows/release.yml. They protect the release order
// (verify -> prepare -> validate -> atomic push -> publish) from well meaning edits.
// No YAML parser is used on purpose: the file is split into steps by their "- name:" lines.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'release.yml'), 'utf8');

function releaseSteps(text) {
  const releaseJob = text.slice(text.indexOf('\n  release:'));
  return releaseJob
    .split(/^ {6}- name: /m)
    .slice(1)
    .map((block) => ({ name: block.split('\n')[0].trim(), body: block }));
}

const steps = releaseSteps(workflow);
const stepIndex = (marker) => {
  const index = steps.findIndex((step) => step.body.includes(marker));
  assert.notEqual(index, -1, `no release step contains "${marker}"`);
  return index;
};

describe('release order', () => {
  test('verify -> prepare -> validate -> atomic push -> publish', () => {
    const order = [
      'verify-versions.sh',
      'npx nx release --skip-publish',
      'release-refs.sh release-state',
      'release-refs.sh validate-release',
      'release-refs.sh push-release',
      'npx nx release publish',
    ].map(stepIndex);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(new Set(order).size, order.length, 'each marker lives in its own step');
  });

  test('the baseline verifier runs in strict mode, before Nx can create anything', () => {
    const verify = steps[stepIndex('verify-versions.sh')].body;
    assert.doesNotMatch(verify, /--mode recovery/);
    assert.ok(stepIndex('verify-versions.sh') < stepIndex('snapshot-tags'));
    assert.ok(stepIndex('snapshot-tags') < stepIndex('npx nx release --skip-publish'));
  });

  test('Nx never publishes or pushes by itself', () => {
    const nx = steps[stepIndex('npx nx release --skip-publish')].body;
    assert.match(nx, /nx release --skip-publish\s*$/m);
    const nxCalls = workflow.split('\n').filter((line) => /npx nx release/.test(line));
    assert.equal(nxCalls.length, 2);
    assert.ok(nxCalls.every((line) => /nx release (--skip-publish|publish)\s*$/.test(line)), nxCalls.join('\n'));
  });

  test('publish only follows a successful push and a real release', () => {
    const publish = steps[stepIndex('npx nx release publish')].body;
    assert.match(publish, /if: steps\.decide\.outputs\.result == 'release'/);
    assert.doesNotMatch(publish, /always\(\)|failure\(\)|continue-on-error/);
    assert.doesNotMatch(steps[stepIndex('release-refs.sh push-release')].body, /continue-on-error/);
  });

  test('no step after the tags exist is allowed to continue on error', () => {
    assert.doesNotMatch(workflow, /continue-on-error/);
  });
});

describe('forbidden operations', () => {
  const forbidden = [
    [/last-release/, 'the moving last-release tag'],
    [/--force|--force-with-lease|\s-f\s/, 'force pushes'],
    [/git rebase|git commit --amend|git reset/, 'history rewrites'],
    [/git add\b/, 'staging files by hand'],
    [/git push origin main/, 'pushing the branch without the tags'],
    [/--follow-tags|--tags\b/, 'pushing tags implicitly'],
    [/git commit/, 'creating commits outside Nx'],
  ];
  for (const [pattern, label] of forbidden) {
    test(`does not use ${label}`, () => assert.doesNotMatch(workflow, pattern));
  }
});

describe('safeguards', () => {
  test('release job is limited to the authoritative repository and main pushes', () => {
    assert.match(workflow, /if: github\.repository == 'RedHatInsights\/ai-web-clients' && github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  });

  test('releases are serialized, queued in order and never cancelled mid flight', () => {
    assert.match(workflow, /concurrency:\n\s+group: \$\{\{ github\.workflow \}\}-release\n\s+cancel-in-progress: false\n\s+queue: max/);
  });

  test('the job catches up with main before installing, verifying or running Nx', () => {
    const catchUp = stepIndex('release-refs.sh fast-forward origin main');
    assert.ok(catchUp < stepIndex('npm ci'));
    assert.ok(catchUp < stepIndex('verify-versions.sh'));
    assert.ok(catchUp < stepIndex('snapshot-tags'));
  });

  test('npm publishing keeps OIDC, provenance and the protected environment', () => {
    assert.match(workflow, /environment: npm-publish/);
    assert.match(workflow, /id-token: write/);
    assert.match(workflow, /NPM_CONFIG_PROVENANCE: true/);
    assert.match(workflow, /npm_config_legacy_peer_deps: false/);
  });

  test('git writes use the bot token and secrets are passed as environment variables', () => {
    assert.match(workflow, /token: \$\{\{ secrets\.GH_BOT_TOKEN \}\}/);
    const secretLines = workflow.split('\n').filter((line) => line.includes('secrets.'));
    for (const line of secretLines) {
      assert.match(line, /^\s+(token|GPG_PRIVATE_KEY|GIT_USER_NAME|GIT_USER_EMAIL): \$\{\{ secrets\.[A-Z_]+ \}\}$/, line);
    }
    for (const step of steps) {
      const run = step.body.slice(step.body.indexOf('        run:'));
      if (run.length < step.body.length) assert.doesNotMatch(run, /\$\{\{/, `${step.name}: expression inside run:`);
    }
  });

  test('no signed-tag history audit in the job', () => {
    assert.doesNotMatch(workflow, /--require-signed-tags/);
  });
});
