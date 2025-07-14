# AI Agent Context Documentation
## AI Web Clients NX Workspace

> **Last Updated**: Context Version 1.1  
> **Workspace Version**: 1.0.0  
> **Context Version**: 1.1  
> **NX Version**: 21.2.3

---

## 📋 CONTEXT UPDATE INSTRUCTIONS

**FOR FUTURE AI AGENTS**: This document MUST be updated whenever significant changes are made to:
- Workspace architecture decisions
- Development patterns and standards
- Package structure or new packages
- Build/deployment processes
- Code quality standards
- NX configuration changes

**Update Process**:
1. Read this entire document before making changes to the workspace
2. Update relevant sections with new information
3. Increment the Context Version number
4. Add entry to Change Log section
5. Preserve all existing guidelines unless explicitly superseded
6. Test changes across all packages

---

## 🎯 WORKSPACE OVERVIEW

### **Purpose**
NX monorepo for AI-related web client libraries, starting with the IFD (Intelligent Front Door) TypeScript client. This workspace is designed to house multiple client packages for different AI services while maintaining consistent development patterns.

### **Workspace Philosophy**
- **Monorepo Benefits**: Shared tooling, consistent standards, cross-package dependencies
- **Package Independence**: Each package can be published and versioned independently
- **Professional Standards**: No emojis, clean code, comprehensive testing
- **Type Safety**: Strict TypeScript across all packages
- **Dependency Injection**: External dependencies must be injectable for testability

### **Current Packages**
1. **`@redhat-cloud-services/arh-client`** - IFD API TypeScript client (production-ready)

---

## 🏗️ WORKSPACE ARCHITECTURE

### **NX Configuration Structure**
```
ai-web-clients/
├── .eslintrc.json           # Workspace-wide ESLint config
├── .gitignore              # Git ignore patterns
├── .husky/                 # Git hooks for quality gates
├── jest.preset.js          # Jest configuration preset
├── jest.setup.js           # Jest setup for all packages
├── nx.json                 # NX workspace configuration
├── package.json            # Workspace root dependencies
├── project.json            # Workspace-level project config
├── tsconfig.json           # TypeScript base configuration
├── AI_CONTEXT.md           # This file - AI agent context
├── README.md               # Workspace documentation
└── packages/
    └── arh-client/         # IFD client package
        ├── package.json    # Package-specific dependencies
        ├── project.json    # NX project configuration
        ├── src/           # Source code
        ├── USAGE.md       # Package usage documentation
        └── README.md      # Package-specific readme
```

### **NX Project Configuration**
- **Package Manager**: npm
- **Build System**: NX with TypeScript
- **Test Framework**: Jest with TypeScript support
- **Linting**: ESLint with TypeScript rules
- **Git Hooks**: Husky for pre-commit quality checks

### **Workspace Dependencies**
- **Build**: NX 21.2.3, TypeScript 5.8.3
- **Testing**: Jest, @testing-library packages
- **Quality**: ESLint, Prettier (via NX)
- **Git**: Husky for hooks, commitlint for commit standards

---

## 🛠️ DEVELOPMENT GUIDELINES

### **Workspace-Wide Code Standards**

1. **No Emojis Policy** (STRICT)
   - No emojis in code, tests, console outputs, or documentation
   - Use clear, descriptive text for professional appearance
   - This applies to ALL packages in the workspace

2. **TypeScript Standards**
   - Strict mode enabled workspace-wide
   - NO `any` types - use `unknown` for dynamic content
   - Explicit typing for all function parameters and returns
   - Consistent tsconfig.json inheritance

3. **Package Architecture**
   - Each package must follow dependency injection patterns
   - External dependencies (fetch, etc.) must be injectable
   - Comprehensive error handling with custom error classes
   - Full test coverage for public APIs

4. **Dependency Minimization** (CRITICAL)
   - **NO `tslib` dependency** - Use `"importHelpers": false` in TypeScript config
   - Target ES2015+ for native class support, avoiding runtime helpers
   - Zero runtime dependencies preferred for client packages
   - Only add dependencies when absolutely essential for functionality

5. **Import/Export Management**
   - Remove unused imports immediately
   - Export only public APIs from package index
   - Use specific imports (avoid `import *`)
   - Consistent import ordering

### **NX-Specific Patterns**

1. **Project Structure**
   ```typescript
   // Each package should have:
   packages/{package-name}/
   ├── src/lib/           # Main source code
   ├── src/index.ts       # Public API exports
   ├── project.json       # NX project config
   ├── package.json       # Package metadata
   ├── USAGE.md          # Usage documentation
   └── README.md         # Package overview
   ```

2. **NX Commands**
   ```bash
   # Run commands for specific packages
   npx nx test arh-client
   npx nx lint arh-client
   npx nx build arh-client
   
   # Run commands for all packages
   npx nx run-many --target=test --all
   npx nx run-many --target=lint --all
   ```

3. **Package Configuration**
   - Each package must have proper `project.json` with targets
   - Consistent naming: `@redhat-cloud-services/{package-name}`
   - Independent versioning and publishing

### **Quality Gates**

1. **Pre-commit Hooks** (via Husky)
   - Linting checks for all changed files
   - Test execution for affected packages
   - Commit message format validation

2. **Testing Requirements**
   - Unit tests for all public methods
   - Mock external dependencies
   - No external API calls in tests
   - Professional test descriptions (no emojis)

3. **Linting Standards**
   - ESLint configuration shared across packages
   - Consistent code formatting
   - Strict TypeScript rules

---

## 📦 PACKAGE DEVELOPMENT PATTERNS

### **IFD Client Package (Reference Implementation)**

The `arh-client` package serves as the reference implementation for all future packages in this workspace.

#### **Architecture Decisions**
- **Dependency Injection**: All external deps injectable
- **Interface Segregation**: Clear separation of concerns
- **Error Handling**: Custom error hierarchy
- **Streaming Support**: Native JavaScript implementation
- **Type Safety**: Complete TypeScript coverage

#### **File Structure Pattern**
```
src/lib/
├── client.ts              # Main client class
├── interfaces.ts          # Dependency injection contracts
├── types.ts               # API types + error classes
├── {feature}-types.ts     # Feature-specific types
├── {feature}-handler.ts   # Feature implementations
├── examples.ts            # Usage examples
└── index.ts               # Public API exports
```

#### **API Client Pattern**
```typescript
// Standard method structure for all packages
async methodName(
  required: string,
  optional?: RequestOptions
): Promise<ResponseType> {
  return this.makeRequest<ResponseType>('/api/endpoint', {
    method: 'POST',
    body: JSON.stringify(data),
    ...optional
  });
}
```

### **New Package Guidelines**

When creating new packages in this workspace:

1. **Use IFD Client as Template**
   - Copy architectural patterns
   - Adapt dependency injection approach
   - Maintain error handling standards

2. **Package Naming**
   - Use `@redhat-cloud-services/{service-name}-client` pattern
   - Keep names descriptive and consistent

3. **Configuration**
   - Copy and adapt `project.json` from arh-client
   - Ensure proper NX target configuration
   - Maintain consistent package.json structure
   - **Set `"importHelpers": false`** in tsconfig to avoid tslib dependency
   - Keep dependencies section empty unless absolutely required

---

## 🔧 TECHNICAL SPECIFICATIONS

### **Workspace Requirements**
- **Node.js**: 18+ (for native fetch support)
- **npm**: Latest stable version
- **NX**: 21.2.3 or compatible
- **TypeScript**: 5.8.3 or compatible

### **Development Environment**
- Modern IDE with TypeScript support
- Git for version control
- Terminal access for NX commands

### **Build Process**
- TypeScript compilation via NX
- Jest testing with coverage reports
- ESLint for code quality
- Husky for git hooks

---

## ⚙️ WORKSPACE CONFIGURATION

### **NX Configuration (nx.json)**
```json
{
  "extends": "nx/presets/npm.json",
  "targetDefaults": {
    "test": {
      "inputs": ["default", "^default"],
      "cache": true
    },
    "lint": {
      "inputs": ["default", "{workspaceRoot}/.eslintrc.json"],
      "cache": true
    }
  }
}
```

### **TypeScript Configuration**
- Base config in workspace root
- Package-specific configs extend base
- Strict mode enabled
- Comprehensive type checking
- **`"importHelpers": false`** - Prevents tslib dependency requirement
- Target ES2015+ for native class inheritance support

### **ESLint Configuration**
- Workspace-wide rules in `.eslintrc.json`
- TypeScript-specific rules
- No unused variables/imports
- Professional code standards

---

## 🧪 TESTING STRATEGY

### **Workspace Testing Approach**
- Jest as primary testing framework
- Shared configuration via `jest.preset.js`
- Mock external dependencies consistently
- Professional test descriptions (no emojis)

### **Package Testing Requirements**
- Unit tests for all public APIs
- Integration tests for complex workflows
- Error scenario coverage
- Streaming/async functionality testing

### **Test Organization**
```
src/lib/
├── __tests__/         # Test files (optional pattern)
├── feature.spec.ts    # Co-located tests (preferred)
└── feature.ts         # Source files
```

---

## 📚 USAGE PATTERNS

### **Package Installation**
```bash
# Install specific package
npm install @redhat-cloud-services/arh-client

# Development in workspace
cd packages/arh-client
npm test
npx nx test arh-client  # From workspace root
```

### **Package Development**
```bash
# Create new package (manual process)
mkdir packages/new-client
cd packages/new-client
# Copy structure from arh-client
# Update package.json and project.json
# Implement following established patterns
```

### **Cross-Package Dependencies**
```typescript
// Import from other workspace packages
import { SharedUtility } from '@redhat-cloud-services/shared-utils';
// Follow established dependency injection patterns
```

---

## 🚨 COMMON ISSUES & SOLUTIONS

### **NX Issues**
- **Module Resolution**: Ensure proper tsconfig paths
- **Cache Issues**: Use `npx nx reset` to clear cache
- **Project Config**: Verify project.json targets are correct

### **Workspace Issues**
- **Dependency Conflicts**: Use npm workspaces properly
- **Version Mismatches**: Keep workspace dependencies aligned
- **Build Failures**: Check TypeScript configuration inheritance

### **Package Development Issues**
- **Import Errors**: Verify index.ts exports
- **Test Failures**: Ensure proper mocking setup
- **Lint Issues**: Follow established patterns from arh-client

### **Dependency Management Issues**
- **tslib Dependency**: NEVER add `tslib` - use `"importHelpers": false` instead
- **Runtime Dependencies**: Question every dependency - prefer zero runtime deps
- **TypeScript Helpers**: Target ES2015+ supports classes natively, no helpers needed
- **Minimal Package Size**: Keep packages lean for better performance and security

---

## 📝 CHANGE LOG

### Version 1.1
- **ADDED: tslib dependency avoidance policy** - Prevents unnecessary runtime dependencies
- Updated TypeScript configuration to use `"importHelpers": false`
- Established zero runtime dependencies as preferred standard
- Enhanced package development guidelines with dependency minimization rules

### Version 1.0
- Initial workspace context documentation created
- Established NX monorepo structure
- Implemented arh-client as reference package
- Created development guidelines and standards
- Established no-emoji policy workspace-wide
- Configured comprehensive quality gates
- Set up TypeScript strict mode workspace-wide

### Instructions for Future Versions
When updating this workspace context:
1. Add new entry to change log with version number and reasoning
2. Update relevant sections with new patterns/standards
3. Increment context version number
4. Test changes across all packages
5. Preserve existing guidelines unless explicitly superseded
6. Document any breaking changes or migration steps

---

## 🎯 FUTURE CONSIDERATIONS

### **Potential New Packages**
- Additional AI service clients following arh-client patterns
- Shared utilities package for common functionality
- Testing utilities package for consistent mocking
- Type definitions package for shared interfaces

### **Workspace Enhancements**
- Automated package generation tools
- Cross-package integration testing
- Automated release management
- Package documentation generation

### **Maintenance Guidelines**
- Regular NX version updates
- Dependency security audits
- Cross-package compatibility testing
- Documentation consistency checks

---

## 🔗 REFERENCE LINKS

### **NX Documentation**
- [NX Workspace Configuration](https://nx.dev/reference/nx-json)
- [NX Project Configuration](https://nx.dev/reference/project-configuration)

### **Package Examples**
- **IFD Client**: `packages/arh-client/` - Reference implementation
- **Usage Documentation**: `packages/arh-client/USAGE.md`

---

**END OF WORKSPACE CONTEXT DOCUMENTATION**

> This document serves as the authoritative guide for AI agents working on any part of the AI Web Clients NX workspace. All development decisions should align with the principles and patterns established here. When in doubt, refer to the `arh-client` package as the reference implementation. 