'use strict';

// Run: node --test .github/scripts/commit-scope-rule.test.cjs

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseHeader,
  isBreakingCommit,
  validateCommit,
  loadReleasableProjectNames,
  createScopeRule,
} = require('./commit-scope-rule.cjs');

const PROJECTS = ['aai-client', 'lightspeed-client', 'mas-client'];
const loadProjects = () => PROJECTS;
const failingLoader = () => {
  throw new Error('project discovery exploded');
};

const commit = (header, body = '', footer = '') => ({ header, body, footer });
const check = (header, body, footer, loader = loadProjects) =>
  validateCommit(commit(header, body, footer), loader);

describe('parseHeader', () => {
  test('reads type, scope and bang', () => {
    assert.deepEqual(parseHeader('feat(mas-client)!: add thing'), {
      type: 'feat',
      scope: 'mas-client',
      bang: true,
    });
  });

  test('scope and bang are optional', () => {
    assert.deepEqual(parseHeader('fix: thing'), { type: 'fix', scope: null, bang: false });
  });

  test('returns null for a non conventional header', () => {
    assert.equal(parseHeader('Stream | MAS-CLIENT | Modification'), null);
  });
});

describe('isBreakingCommit', () => {
  test('detects the bang in the header', () => {
    assert.equal(isBreakingCommit(commit('fix(mas-client)!: x')), true);
  });

  test('detects a BREAKING CHANGE footer', () => {
    assert.equal(isBreakingCommit(commit('fix: x', '', 'BREAKING CHANGE: gone')), true);
  });

  test('detects BREAKING-CHANGE in the body', () => {
    assert.equal(isBreakingCommit(commit('fix: x', 'text\nBREAKING-CHANGE: gone')), true);
  });

  test('plain commits are not breaking', () => {
    assert.equal(isBreakingCommit(commit('fix: x', 'mentions breaking things')), false);
  });
});

describe('feat commits need valid project scopes', () => {
  test('single valid project', () => {
    assert.equal(check('feat(lightspeed-client): add x').valid, true);
  });

  test('comma separated valid projects, with optional spaces', () => {
    assert.equal(check('feat(aai-client,mas-client): add x').valid, true);
    assert.equal(check('feat(aai-client, mas-client): add x').valid, true);
  });

  test('missing scope', () => {
    const result = check('feat: add x');
    assert.equal(result.valid, false);
    assert.match(result.message, /lightspeed-client/); // lists valid names
  });

  test('npm scoped package name is rejected', () => {
    const result = check('feat(@redhat-cloud-services/lightspeed-client): add x');
    assert.equal(result.valid, false);
    assert.match(result.message, /@redhat-cloud-services\/lightspeed-client/);
  });

  test('unknown project is rejected', () => {
    assert.equal(check('feat(unknown): add x').valid, false);
  });

  test('area scope is rejected for feat', () => {
    assert.equal(check('feat(release): add x').valid, false);
  });

  test('one bad entry in a list rejects the whole list', () => {
    assert.equal(check('feat(aai-client,unknown): add x').valid, false);
  });

  test('empty list items are rejected', () => {
    assert.equal(check('feat(aai-client,): add x').valid, false);
    assert.equal(check('feat(,aai-client): add x').valid, false);
    assert.equal(check('feat(): add x').valid, false);
  });

  test('duplicate entries are rejected', () => {
    const result = check('feat(aai-client,aai-client): add x');
    assert.equal(result.valid, false);
    assert.match(result.message, /duplicate/i);
  });

  test('glob and tag patterns are rejected', () => {
    assert.equal(check('feat(*): add x').valid, false);
    assert.equal(check('feat(npm:public): add x').valid, false);
  });

  test('project discovery failure rejects the commit with the cause', () => {
    const result = check('feat(aai-client): add x', '', '', failingLoader);
    assert.equal(result.valid, false);
    assert.match(result.message, /project discovery exploded/);
  });
});

describe('breaking commits need valid project scopes', () => {
  test('fix with bang and valid project scope', () => {
    assert.equal(check('fix(mas-client)!: drop x').valid, true);
  });

  test('fix with bang and no scope', () => {
    assert.equal(check('fix!: drop x').valid, false);
  });

  test('chore with bang and area scope', () => {
    assert.equal(check('chore(deps)!: drop node 18').valid, false);
  });

  test('footer without a scope', () => {
    assert.equal(check('fix: x', '', 'BREAKING CHANGE: gone').valid, false);
  });

  test('footer with a valid scope', () => {
    assert.equal(check('refactor(aai-client): x', '', 'BREAKING CHANGE: gone').valid, true);
  });

  test('project discovery failure rejects breaking commits', () => {
    assert.equal(check('fix(aai-client)!: x', '', '', failingLoader).valid, false);
  });
});

describe('non versioning commits stay easy', () => {
  test('fix without scope', () => {
    assert.equal(check('fix: typo').valid, true);
  });

  test('fix with an area scope', () => {
    assert.equal(check('fix(release): use nvmrc').valid, true);
  });

  test('fix with a project scope', () => {
    assert.equal(check('fix(aai-client): typo').valid, true);
  });

  test('chore without scope', () => {
    assert.equal(check('chore: tidy').valid, true);
  });

  test('chore(deps) and ci(release)', () => {
    assert.equal(check('chore(deps): bump').valid, true);
    assert.equal(check('ci(release): tweak').valid, true);
  });

  test('does not load projects when not needed', () => {
    assert.equal(check('fix: typo', '', '', failingLoader).valid, true);
  });

  test('glob style scope on a fix is rejected: Nx would treat it as ambiguous', () => {
    assert.equal(check('fix(*): x').valid, false);
    assert.equal(check('fix(npm:public): x').valid, false);
    assert.equal(check('fix(a,*): x').valid, false);
  });

  test('empty list items on a fix are rejected', () => {
    assert.equal(check('fix(release,): x').valid, false);
  });

  test('non conventional headers are left to the other commitlint rules', () => {
    assert.equal(check('Stream | MAS-CLIENT | Modification').valid, true);
  });
});

describe('release commit', () => {
  test('version sync commit is exempt even if a body mentions BREAKING CHANGE', () => {
    const body = '## 1.0.0\n\n- BREAKING CHANGE: old api removed';
    const subject = 'chore(versions): package.json version sync + changelog';
    assert.equal(check(`${subject} [skip ci]`, body).valid, true);
    assert.equal(check(subject, body).valid, true);
  });

  test('only the exact release header is exempt', () => {
    assert.equal(check('chore(versions)!: package.json version sync + changelog').valid, false);
    assert.equal(check('feat(versions): package.json version sync + changelog').valid, false);
  });
});

describe('createScopeRule (commitlint adapter)', () => {
  const rule = createScopeRule(loadProjects);

  test('maps a valid parsed commit to [true]', () => {
    const [valid] = rule({ header: 'feat(aai-client): x', body: null, footer: null });
    assert.equal(valid, true);
  });

  test('maps an invalid parsed commit to [false, message]', () => {
    const [valid, message] = rule({ header: 'feat: x', body: null, footer: null });
    assert.equal(valid, false);
    assert.equal(typeof message, 'string');
  });

  test('is a no-op when configured as never', () => {
    const [valid] = rule({ header: 'feat: x', body: null, footer: null }, 'never');
    assert.equal(valid, true);
  });
});

describe('loadReleasableProjectNames', () => {
  const withWorkspace = (layout, run) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-rule-'));
    try {
      fs.mkdirSync(path.join(root, 'packages'));
      for (const [dir, files] of Object.entries(layout)) {
        fs.mkdirSync(path.join(root, 'packages', dir), { recursive: true });
        for (const [file, content] of Object.entries(files)) {
          fs.writeFileSync(path.join(root, 'packages', dir, file), content);
        }
      }
      return run(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };

  test('uses project.json names, not npm names, and skips private packages', () => {
    const layout = {
      a: {
        'project.json': JSON.stringify({ name: 'a-client' }),
        'package.json': JSON.stringify({ name: '@scope/a' }),
      },
      b: {
        'project.json': JSON.stringify({ name: 'b-internal' }),
        'package.json': JSON.stringify({ name: '@scope/b', private: true }),
      },
    };
    assert.deepEqual(withWorkspace(layout, loadReleasableProjectNames), ['a-client']);
  });

  test('throws when there are no releasable projects', () => {
    assert.throws(() => withWorkspace({}, loadReleasableProjectNames), /no releasable projects/i);
  });

  test('throws when a project.json has no name', () => {
    const layout = {
      a: { 'project.json': '{}', 'package.json': JSON.stringify({ name: '@scope/a' }) },
    };
    assert.throws(() => withWorkspace(layout, loadReleasableProjectNames), /name/);
  });

  test('throws on unreadable json', () => {
    const layout = {
      a: { 'project.json': '{nope', 'package.json': JSON.stringify({ name: '@scope/a' }) },
    };
    assert.throws(() => withWorkspace(layout, loadReleasableProjectNames));
  });

  test('matches the real workspace', () => {
    const names = loadReleasableProjectNames();
    assert.ok(names.includes('mas-client'));
    assert.ok(!names.includes('@redhat-cloud-services/mas-client'));
  });
});
