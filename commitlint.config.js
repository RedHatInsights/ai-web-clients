const { createScopeRule } = require('./scripts/commit-scope-rule.cjs');

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        // feat and breaking commits must name releasable Nx projects.
        // See scripts/commit-scope-rule.cjs.
        'releasable-project-scope': createScopeRule(),
      },
    },
  ],
  rules: {
    'releasable-project-scope': [2, 'always'],
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
  },
};
