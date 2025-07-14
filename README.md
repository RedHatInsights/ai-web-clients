# AI Web Clients Monorepo

A monorepo for AI web client applications built with NX, TypeScript, React, Jest, and Cypress.

## Structure

```
ai-web-clients/
├── packages/           # All packages/applications go here
├── .github/workflows/  # GitHub Actions workflows
├── .husky/            # Git hooks (modern Husky v9+)
├── nx.json            # NX configuration
├── tsconfig.json      # TypeScript configuration
├── jest.preset.js     # Jest configuration
├── jest.setup.js      # Jest setup file
├── .eslintrc.json     # ESLint configuration
├── commitlint.config.js # Commitlint configuration
├── .releaserc.json    # Semantic release configuration
└── package.json       # Root package.json
```

## Scripts

### Development
- `npm run build` - Build all packages
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Lint all packages
- `npm run lint:fix` - Fix linting issues
- `npm run e2e` - Run e2e tests
- `npm run serve` - Serve applications
- `npm run graph` - View dependency graph

### Affected Commands
- `npm run affected:build` - Build only affected packages
- `npm run affected:test` - Test only affected packages
- `npm run affected:lint` - Lint only affected packages
- `npm run affected:e2e` - E2e test only affected packages

### Versioning & Releases
- `npm run version` - Version all packages based on conventional commits
- `npm run version:dry-run` - Preview version changes without applying them
- `npm run release` - Release all packages (runs in CI)
- `npm run release:dry-run` - Preview release without applying changes

## Technologies

- **NX**: Monorepo management and build system
- **TypeScript**: Type-safe JavaScript
- **React**: UI framework
- **Jest**: Unit testing
- **Cypress**: End-to-end testing
- **ESLint**: Code linting
- **@jscutlery/semver**: Semantic versioning and releases
- **Conventional Commits**: Commit message format for automated versioning
- **Husky v9+**: Modern git hooks for code quality

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a new package:
   ```bash
   nx generate @nx/react:application my-app
   # or
   nx generate @nx/react:library my-lib
   ```

3. Run the application:
   ```bash
   nx serve my-app
   ```

## Package Structure

All packages should be created in the `packages/` directory. NX will automatically detect and configure packages placed there.

## Git Hooks (Quality Gates)

The repository uses **Husky v9+** for git hooks:

- **pre-commit**: Runs linting and tests before allowing commits
- **commit-msg**: Validates commit messages follow conventional commit format

These hooks ensure code quality and consistent commit messages for automated versioning.

## Versioning Strategy

This monorepo uses **semantic versioning** with automated releases:

### Commit Message Format
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature (minor version bump)
- `fix`: Bug fix (patch version bump)
- `BREAKING CHANGE`: Breaking change (major version bump)
- `chore`, `docs`, `style`, `refactor`, `test`: No version bump

### Cross-Package Dependencies
When package B (dependency) is updated, package A (dependent) will automatically:
1. Update its dependency on package B to the new version
2. Receive its own version bump
3. Trigger a new release

### Release Process
1. **Automated**: Releases happen automatically via GitHub Actions on pushes to `main`
2. **Manual**: Run `npm run release` locally (requires proper git setup)
3. **Preview**: Use `npm run version:dry-run` to preview changes

## Examples

### Creating a new library with versioning:
```bash
# Generate the library
nx generate @nx/react:library my-lib

# The library will automatically inherit versioning configuration
# Start making commits with conventional commit messages
git add .
git commit -m "feat(my-lib): add new awesome feature"

# Version and release
npm run release
```

### Setting up dependencies between packages:
```bash
# Create two libraries
nx generate @nx/react:library shared-utils
nx generate @nx/react:library my-app

# In my-app, add dependency to shared-utils
# When shared-utils gets updated, my-app will automatically bump its version
``` 