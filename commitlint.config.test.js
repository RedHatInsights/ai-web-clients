/**
 * Tests for the custom commitlint scope-full-name-for-versioning rule.
 * Run: NODE_OPTIONS="--experimental-vm-modules" npx jest --config=commitlint.jest.config.js
 */

const config = require('./commitlint.config');

const parserOpts = {
  headerPattern: /^(\w*)(?:\(([^)]*)\))?!?: (.*)$/,
  headerCorrespondence: ['type', 'scope', 'subject'],
};

let lint;
beforeAll(async () => {
  const mod = await import('@commitlint/lint');
  lint = mod.default;
});

const lintMessage = (message) =>
  lint(message, config.rules, { plugins: config.plugins, parserOpts });

describe('commitlint scope-full-name-for-versioning', () => {
  describe('valid commits', () => {
    it('feat with bare project name', async () => {
      const result = await lintMessage('feat(arh-client): add endpoint');
      expect(result.valid).toBe(true);
    });

    it('feat with another project', async () => {
      const result = await lintMessage('feat(lightspeed-client): add endpoint');
      expect(result.valid).toBe(true);
    });

    it('fix with bare project name', async () => {
      const result = await lintMessage('fix(mas-client): handle error');
      expect(result.valid).toBe(true);
    });

    it('breaking with bare project name (! marker)', async () => {
      const result = await lintMessage('feat(arh-client)!: remove v1');
      expect(result.valid).toBe(true);
    });

    it('BREAKING CHANGE footer with bare project name', async () => {
      const result = await lintMessage(
        'chore(arh-client): change\n\nBREAKING CHANGE: removed API'
      );
      expect(result.valid).toBe(true);
    });

    it('multiple scopes comma-separated', async () => {
      const result = await lintMessage(
        'feat(arh-client,ai-client-common): shared change'
      );
      expect(result.valid).toBe(true);
    });

    it('chore with uppercase ticket scope (scope-case disabled)', async () => {
      const result = await lintMessage('chore(RHCLOUD-51799): security fixes');
      expect(result.valid).toBe(true);
    });

    it('fix with area scope (deps)', async () => {
      const result = await lintMessage('fix(deps): bump axios');
      expect(result.valid).toBe(true);
    });

    it('refactor with no scope (non-versioning)', async () => {
      const result = await lintMessage('refactor: rewrite internals');
      expect(result.valid).toBe(true);
    });

    it('fix with no scope (non-versioning)', async () => {
      const result = await lintMessage('fix: update');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid commits', () => {
    it('feat with made-up short scope', async () => {
      const result = await lintMessage('feat(utils): add endpoint');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be an Nx project name');
    });

    it('feat with full npm package name (js-clients habit)', async () => {
      const result = await lintMessage(
        'feat(@redhat-cloud-services/arh-client): add feature'
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain(
        'bare project names as scopes'
      );
    });

    it('feat with area scope (deps)', async () => {
      const result = await lintMessage('feat(deps): upgrade deps');
      expect(result.valid).toBe(false);
    });

    it('feat with ticket scope', async () => {
      const result = await lintMessage('feat(RHCLOUD-52306): add feature');
      expect(result.valid).toBe(false);
    });

    it('feat with no scope', async () => {
      const result = await lintMessage('feat: global change');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Scope required');
    });

    it('breaking with no scope (! marker)', async () => {
      const result = await lintMessage('fix!: breaking fix');
      expect(result.valid).toBe(false);
    });

    it('BREAKING CHANGE footer with no scope', async () => {
      const result = await lintMessage(
        'refactor: rewrite\n\nBREAKING CHANGE: new API'
      );
      expect(result.valid).toBe(false);
    });

    it('breaking with short scope (! marker)', async () => {
      const result = await lintMessage('chore(utils)!: breaking change');
      expect(result.valid).toBe(false);
    });

    it('comma-separated with one invalid scope', async () => {
      const result = await lintMessage(
        'feat(arh-client,nonexistent): mixed scopes'
      );
      expect(result.valid).toBe(false);
    });
  });
});
