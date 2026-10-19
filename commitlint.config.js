const { execSync } = require('child_process');

function getNxProjects() {
  try {
    const output = execSync('npx nx show projects --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch {
    return [];
  }
}

const validProjects = new Set(getNxProjects());

module.exports = {
  extends: ['@commitlint/config-conventional'],
  defaultIgnores: true,
  rules: {
    // Keep the explicit type list from the previous config (documents intent;
    // identical to @commitlint/config-conventional defaults).
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
    'scope-case': [0], // allow uppercase scopes, e.g. chore(RHCLOUD-52306)
    'body-max-length': [0],
    'body-max-line-length': [0],
    'header-max-length': [2, 'always', 256],
    'scope-full-name-for-versioning': [2, 'always'],
  },
  plugins: [
    {
      rules: {
        // nx release (useCommitScope=true) resolves the version target from the
        // commit scope; feat/breaking commits must name a real nx project.
        'scope-full-name-for-versioning': (parsed) => {
          const { type, scope, header, notes } = parsed;

          // Detect breaking change: header `!:` marker OR BREAKING CHANGE footer
          const isBreaking =
            !!(header && header.includes('!:')) ||
            !!(notes && notes.some((n) => n.title === 'BREAKING CHANGE'));
          const isVersioningType = type === 'feat';

          // Non-versioning, non-breaking commits can use any scope
          if (!isBreaking && !isVersioningType) {
            return [true];
          }

          // Scope required for feat and breaking commits
          if (!scope) {
            const commitType = isBreaking ? 'breaking (!)/feat' : 'feat';
            return [
              false,
              `Scope required for ${commitType} commits.\n` +
                `Use: ${type}(arh-client): ...`,
            ];
          }

          // Extract scope from raw header as fallback when parser strips it
          let resolvedScope = scope;
          if (!resolvedScope && header) {
            const match = header.match(/^\w+\(([^)]+)\)/);
            if (match) {
              resolvedScope = match[1];
            }
          }

          if (!resolvedScope) {
            return [true];
          }

          const scopes = resolvedScope.split(',');
          for (const s of scopes) {
            const trimmed = s.trim();
            if (!validProjects.has(trimmed)) {
              const commitType = isBreaking ? 'breaking (!)/feat' : 'feat';
              const hint = trimmed.startsWith('@redhat-cloud-services/')
                ? `This repo uses bare project names as scopes (run: npx nx show projects), not npm package names`
                : `Unknown project "${trimmed}". Run: npx nx show projects`;
              return [
                false,
                `Scope "${trimmed}" must be an Nx project name for ${commitType} commits.\n${hint}`,
              ];
            }
          }

          return [true];
        },
      },
    },
  ],
};
