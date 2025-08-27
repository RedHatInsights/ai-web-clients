# Development Guidelines
## AI Web Clients NX Workspace

> Part of the modular AI context system. See [AI_CONTEXT.md](./AI_CONTEXT.md) for overview.

---

## 🛠️ DEVELOPMENT GUIDELINES

### **NX Executor Usage (CRITICAL)**
- **ALWAYS use NX executors** defined in individual `project.json` files for builds and tests
- **NEVER use npm/yarn scripts directly** for project operations
- **Check project.json** before running any build or test commands

#### **Proper NX Commands**
```bash
# Correct way to run tests for a specific project
npx nx run project-name:test

# Correct way to build a specific project
npx nx run project-name:build

# Check project.json to see available targets
cat packages/project-name/project.json

# Wrong ways (do not use):
npm test                    # Uses workspace root scripts
cd packages/project && npm test  # Bypasses NX configuration
```

#### **Example Project Configuration**
```json
{
  "targets": {
    "test": {
      "executor": "@nx/jest:jest",
      "options": {
        "jestConfig": "packages/project-name/jest.config.ts"
      }
    },
    "build": {
      "executor": "@nx/js:tsc",
      "options": {
        "outputPath": "dist/packages/project-name"
      }
    }
  }
}
```

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

4. **fetchFunction Configuration** (CRITICAL)
   - **ALWAYS use arrow functions** for fetchFunction parameter: `fetchFunction: (input, init) => fetch(input, init)`
   - **NEVER use direct references** like `fetchFunction: fetch` - this can cause context loss
   - **Alternative**: Use bound functions: `fetchFunction: fetch.bind(window)`
   - **Authentication**: Use arrow functions with custom logic: `fetchFunction: async (input, init) => { const token = await getToken(); return fetch(input, {...init, headers: {...init?.headers, Authorization: \`Bearer ${token}\`}}); }`
   - **NEVER set 'Content-Type' headers** - AI clients manage Content-Type internally based on endpoint requirements
   - This prevents 'this' context issues and ensures reliable function execution

5. **Dependency Minimization** (CRITICAL)
   - **NO `tslib` dependency** - Use `"importHelpers": false` in TypeScript config
   - Target ES2015+ for native class support, avoiding runtime helpers
   - Zero runtime dependencies preferred for client packages
   - Only add dependencies when absolutely essential for functionality
   - **NO FORCE INSTALLS** - Never use `--force` flag with npm/package managers

6. **Import/Export Management**
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
   npx nx run arh-client:test
   npx nx run arh-client:lint
   npx nx run arh-client:build
   
   # Run commands for all packages
   npx nx run-many --target=test --all
   NX_TUI=false npx nx run-many --target=test --all  # Clean output for CI/debugging
   npx nx run-many --target=lint --all
   
   # Run integration tests
   npx nx run client-integration-tests:test
   ```

3. **Package Configuration**
   - Each package must have proper `project.json` with targets
   - Consistent naming: `@redhat-cloud-services/{package-name}`
   - Independent versioning and publishing

### **Documentation Standards** (CRITICAL)

1. **Code-Only Documentation Policy**
   - Technical documentation must ONLY reflect actual, existing code
   - NO code examples from unit tests - examples must be from public interfaces
   - NO references to non-existent code or planned features
   - Document only code with public interfaces accessible to library users

2. **Documentation File Structure**
   - **Developer documentation goes in README files** - Individual package READMEs and workspace root README.md
   - Each package must have its own README.md with comprehensive usage examples matching actual exports
   - AI_CONTEXT.md is for AI agent context only, not developer documentation
   - Split documentation appropriately: package READMEs for usage, USAGE.md for advanced examples
   - Workspace README.md for overall project overview

3. **Documentation Accuracy Requirements**
   - **EVERY interface, method, hook, and type** documented must exist in actual exports
   - **Method signatures** must match exactly including parameter names, types, and return types
   - **Interface examples** must reflect actual field names and types from source code
   - **Import statements** must only reference actually exported symbols
   - **NO approximations or "mostly accurate" documentation** - every detail must be 100% correct

4. **Public API Documentation**
   - Focus on exported functions, classes, and interfaces
   - Document actual usage patterns that consumers can implement
   - Verify all code examples exist in the actual codebase before documenting
   - Remove any documentation references to internal or test-only code

5. **Client-Specific Documentation Separation**
   - **Common package READMEs** should only document interfaces, types, and shared functionality
   - **NEVER add client-specific examples** to common package documentation
   - **Client-specific examples** belong only in individual client package READMEs
   - Keep common documentation focused on the shared API contracts and interfaces

6. **Documentation Verification**
   - All code examples must be traceable to actual implementation files
   - Examples should demonstrate real public API usage
   - No hypothetical or "could work" examples
   - Update documentation immediately when public APIs change

7. **Source Code Audit Patterns** (CRITICAL)
   - **ALWAYS verify exports** - Check that documented imports match actual exports in index.ts files
   - **Verify method signatures** - Ensure documented method calls match actual implementations
   - **Check return types** - Document actual return structures, not assumed ones
   - **Source code is source of truth** - When documentation conflicts with implementation, update docs to match code

8. **AI Client Documentation Patterns** (CRITICAL)
   - **Streaming requirements** - All streaming examples MUST include `afterChunk` callback requirement
   - **Init method structure** - Document that `client.init()` returns `{ conversations, limitation?, error? }` (initialConversationId was removed)
   - **fetchFunction patterns** - Always show arrow function usage: `fetchFunction: (input, init) => fetch(input, init)`
   - **Health check methods** - Verify actual method names per client (e.g., `healthCheck()` vs `livenessCheck()`)
   - **Configuration interfaces** - Document actual interface shapes, including optional properties like `initOptions`

9. **Type Export Documentation** (CRITICAL)
   - **Verify all TypeScript imports** - Ensure every type in documentation examples is actually exported
   - **Group exports logically** - Separate core types, data types, error types, handlers, and configuration in examples
   - **Check implementation types** - Don't document types that exist in source but aren't exported
   - **Update interface examples** - When interfaces change, update ALL documentation examples that reference them

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

### **Critical Development Patterns**

#### **Dependency Injection** (CRITICAL)
- **External dependencies (fetch, etc.) must be injectable**
- **Default fallbacks must be preserved** - NEVER remove the `|| new DefaultStreamingHandler()` pattern
- **Comprehensive error handling with custom error classes**
- **Full test coverage for public APIs**

#### **ARH Client Default Handler Pattern** (CRITICAL - DO NOT MODIFY)
```typescript
// ALWAYS preserve this fallback pattern in ARH client constructor:
this.defaultStreamingHandler = config.defaultStreamingHandler || new DefaultStreamingHandler();
```
**Why this matters:**
- Provides sensible defaults for users who don't need custom streaming
- Enables the client to work out-of-the-box without complex configuration
- Critical for backward compatibility and ease of use
- **NEVER suggest removing this fallback - it's a core design pattern**

#### **State Manager Lazy Initialization Pattern** (CRITICAL)
```typescript
// State manager now uses lazy initialization by default
const stateManager = createClientStateManager(client);
await stateManager.init(); // No longer auto-creates conversations

// First sendMessage automatically creates conversation
const response = await stateManager.sendMessage('Hello'); // Auto-promotes temporary conversation
```
**Key Implementation Details:**
- **Temporary Conversation ID**: Uses `'__temp_conversation__'` constant for temporary state
- **Automatic Promotion**: First sendMessage promotes temporary to real conversation via `client.createNewConversation()`
- **Retry Logic**: MAX_RETRY_ATTEMPTS = 2 for promotion failures with user-friendly error messages
- **No Auto-Creation**: `init()` method no longer auto-creates conversations, only returns existing ones
- **Backward Compatibility**: All existing APIs preserved, only initialization behavior changed

#### **Removed Patterns** (DO NOT USE)
```typescript
// REMOVED: ClientInitOptions interface no longer exists
// REMOVED: getInitOptions() method removed from all clients
// REMOVED: initialConversationId from init() return type
// REMOVED: initializeNewConversation option

// OLD pattern (no longer supported):
client.getInitOptions(); // Method removed
const { initialConversationId } = await client.init(); // Property removed
```

---

## 🚨 COMMON DEVELOPMENT ISSUES

### **Dependency Management Issues**
- **tslib Dependency**: NEVER add `tslib` - use `"importHelpers": false` instead
- **Runtime Dependencies**: Question every dependency - prefer zero runtime deps
- **TypeScript Helpers**: Target ES2015+ supports classes natively, no helpers needed
- **Minimal Package Size**: Keep packages lean for better performance and security

### **fetchFunction Issues**
- **Context Loss**: Always use arrow functions or bound functions
- **Content-Type Conflicts**: Never set Content-Type headers in fetchFunction
- **Authentication**: Use arrow functions for custom authentication logic

### **NX Issues**
- **Module Resolution**: Ensure proper tsconfig paths
- **Cache Issues**: Use `npx nx reset` to clear cache
- **Project Config**: Verify project.json targets are correct

---

> For error handling patterns, see [ERROR_HANDLING_PATTERNS.md](./ERROR_HANDLING_PATTERNS.md)  
> For testing strategies, see [TESTING_STRATEGIES.md](./TESTING_STRATEGIES.md)  
> For package development patterns, see [PACKAGE_PATTERNS.md](./PACKAGE_PATTERNS.md)