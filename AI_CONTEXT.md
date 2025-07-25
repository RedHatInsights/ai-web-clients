# AI Agent Context Documentation
## AI Web Clients NX Workspace

> **Last Updated**: Context Version 2.0  
> **Workspace Version**: 1.0.0  
> **Context Version**: 2.0  
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
2. **`@redhat-cloud-services/lightspeed-client`** - LightSpeed API TypeScript client
3. **`@redhat-cloud-services/ai-client-common`** - Common interfaces and utilities for AI clients
4. **`@redhat-cloud-services/ai-client-state`** - State management for AI client interactions with conversation management capabilities
5. **`@redhat-cloud-services/ai-react-state`** - React hooks for AI state management integration

### **Current Apps**
1. **`client-integration-tests`** - Integration test app for validating package interoperability
2. **`react-integration-tests`** - React integration test app for AI client components
3. **`react-integration-tests-e2e`** - End-to-end tests for React integration

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
   - **Developer documentation goes in README files** - NOT in AI_CONTEXT.md
   - Each package must have its own README.md with comprehensive usage examples
   - AI_CONTEXT.md is for AI agent context only, not developer documentation
   - Split documentation appropriately: package READMEs for usage, USAGE.md for advanced examples
   - Workspace README.md for overall project overview

3. **Public API Documentation**
   - Focus on exported functions, classes, and interfaces
   - Document actual usage patterns that consumers can implement
   - Verify all code examples exist in the actual codebase before documenting
   - Remove any documentation references to internal or test-only code

4. **Documentation Verification**
   - All code examples must be traceable to actual implementation files
   - Examples should demonstrate real public API usage
   - No hypothetical or "could work" examples
   - Update documentation immediately when public APIs change

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

### **AI Client State Package (Conversation Management)**

The `ai-client-state` package provides comprehensive state management for AI client interactions with conversation management capabilities.

#### **Public API**
```typescript
export interface StateManager<T> {
  // Initialization
  init(): Promise<void>;
  isInitialized(): boolean;
  isInitializing(): boolean;
  
  // Conversation Management
  setActiveConversationId(conversationId: string): Promise<void>;
  getActiveConversationMessages(): Message<T>[];
  getConversations(): Conversation<T>[];
  createNewConversation(): Promise<IConversation>;
  
  // Message Management
  sendMessage(query: UserQuery, options?: MessageOptions): Promise<any>;
  getMessageInProgress(): boolean;
  
  // State Access
  getState(): ClientState<T>;
  
  // Event System
  subscribe(event: Events, callback: () => void): () => void;
}

export enum Events {
  MESSAGE = 'message',
  ACTIVE_CONVERSATION = 'active-conversation',
  IN_PROGRESS = 'in-progress',
  CONVERSATIONS = 'conversations',
  INITIALIZING_MESSAGES = 'initializing-messages',
}
```

#### **Key Features**
- **Multi-conversation support**: Manage multiple conversations simultaneously
- **Active conversation tracking**: Set and track the currently active conversation
- **Message streaming integration**: Works with client streaming handlers for real-time updates
- **Event-driven architecture**: Subscribe to state changes across the application
- **Conversation history**: Automatic loading of conversation history when switching conversations
- **Message persistence**: Messages are stored and maintained across conversation switches

### **AI React State Package (React Integration)**

The `ai-react-state` package provides React hooks for seamless integration with the AI client state manager.

#### **Public API**
```typescript
// Provider Components
export const AIStateProvider: React.Component<{
  stateManager?: StateManager;
  client?: IAIClient;
  children: React.ReactNode;
}>;

// React Hooks
export function useActiveConversation(): Conversation | null;
export function useSendMessage(): (query: UserQuery, options?: MessageOptions) => Promise<any>;
export function useMessages<T>(): Message<T>[];
export function useActiveInProgress(): boolean;
export function useConversations<T>(): Conversation<T>[];
export function useCreateNewConversation(): () => Promise<IConversation>;
export function useSetActiveConversation(): (conversationId: string) => Promise<void>;
export function useIsInitializing(): boolean;
```

#### **Key Features**
- **React Context integration**: Provides AIStateProvider for state sharing across components
- **Reactive hooks**: Automatically re-render components when state changes
- **Full state manager access**: All state manager functionality available as React hooks
- **TypeScript support**: Full type safety for conversation and message data
- **Event-driven updates**: Hooks automatically subscribe to relevant state events

### **LightSpeed Client Package**

The `lightspeed-client` package provides TypeScript client functionality for the OpenShift LightSpeed API.

#### **Architecture**
- Follows the same architectural patterns as the ARH client (reference implementation)
- Implements `IAIClient<LightSpeedCoreAdditionalProperties>` interface from ai-client-common
- Supports streaming and non-streaming message handling
- Includes dependency injection for fetch function and streaming handlers
- Compatible with ai-client-state for conversation management

#### **Main Class**
```typescript
export class LightspeedClient implements IAIClient<LightSpeedCoreAdditionalProperties> {
  constructor(config: LightspeedClientConfig);
  // Implements all IAIClient methods for LightSpeed API
}
```

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

### **Integration Testing Approach**
- **Integration Test App**: `apps/client-integration-tests` validates package interoperability
- **NX MCP Integration**: Use NX MCP tools to generate test applications instead of manual creation
- **Cross-Package Testing**: Verify that packages work together correctly (ARH client + state manager)
- **Environment Limitations**: Node.js Jest environment has limitations with Web APIs (ReadableStream, etc.)

### **Test Organization**
```
src/lib/
├── __tests__/         # Test files (optional pattern)
├── feature.spec.ts    # Co-located tests (preferred)
└── feature.ts         # Source files

apps/
└── client-integration-tests/  # Cross-package integration tests
    └── src/
        └── *.spec.ts           # Integration test suites
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

### **Version Compatibility Issues** (NEW)
- **@jscutlery/semver Conflicts**: Version 5.6.1 only supports @nx/devkit ^18.0.0 || ^19.0.0 || ^20.0.0
- **Resolution**: Install compatible version: `npm install -D @nx/devkit@20.8.2`
- **Future Path**: Consider migrating to NX 21.x native release functionality
- **General Pattern**: Check peer dependencies before upgrading major NX versions

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

### Version 2.0
- **MAJOR: Conversation Management Documentation** - Added comprehensive documentation for ai-client-state conversation management capabilities
- **NEW: Package Documentation** - Added missing packages: ai-react-state and lightspeed-client to Current Packages section
- **NEW: App Documentation** - Added missing applications: react-integration-tests and react-integration-tests-e2e
- **ENHANCED: State Manager API** - Documented complete StateManager interface including conversation management methods
- **NEW: React Hooks Documentation** - Added ai-react-state package with React hooks for AI state management
- **NEW: LightSpeed Client Documentation** - Added lightspeed-client package documentation following ARH client patterns
- **Updated Package Descriptions** - Enhanced ai-client-state description to reflect conversation management capabilities
- **API Documentation** - Added actual exported interfaces, enums, and hooks based on existing code only
- **Followed Documentation Guidelines** - Ensured all documented features exist in actual codebase, no hallucinations

### Version 1.9
- **CRITICAL: fetchFunction Configuration Rule** - Added mandatory fetchFunction usage patterns to prevent context loss
- **ALWAYS use arrow functions**: `fetchFunction: (input, init) => fetch(input, init)` - never direct references
- **Context Safety**: Prevents 'this' context issues that can cause runtime failures
- **Fixed violations**: Corrected all fetchFunction examples across lightspeed-client USAGE.md
- **Authentication patterns**: Documented arrow function usage for authenticated fetch implementations
- **Alternative**: Document bound functions as acceptable: `fetchFunction: fetch.bind(window)`
- **CRITICAL: Content-Type Header Rule** - Added warning against setting Content-Type in fetchFunction
- **Client Internal Management**: AI clients handle Content-Type headers internally based on endpoint requirements
- **Fixed examples**: Removed dangerous Content-Type headers from ai-client-state authentication examples

### Version 1.8
- **ADDED: Documentation Standards** - Established critical guidelines for technical documentation integrity
- **Code-Only Documentation Policy** - Documentation must ONLY reflect actual, existing code
- **Documentation File Structure** - Developer documentation goes in README files, NOT in AI_CONTEXT.md
- **Package README Requirements** - Each package must have comprehensive README.md with usage examples
- **NO test-only examples** - Examples must come from public interfaces, not unit tests
- **NO non-existent code references** - All documented code must actually exist in the codebase
- **Public API focus** - Document only code accessible to library users through public interfaces
- Added verification requirements to ensure all code examples are traceable to actual implementation

### Version 1.7
- **CRITICAL: Test Server Lifecycle Protection** - Added explicit documentation prohibiting server management in Cypress tests
- **NO `pkill` commands** - Tests must not kill/restart servers
- **NO `cy.exec()` server management** - Server lifecycle is handled externally
- Server management belongs in setup scripts, not test code
- Tests should focus on application behavior, not infrastructure management

### Version 1.6
- **CRITICAL: Default Handler Fallback Protection** - Added explicit documentation to preserve the `|| new DefaultStreamingHandler()` pattern in ARH client
- **NEVER remove default fallbacks** - Core design pattern for backward compatibility and ease of use
- Prevents accidental removal of essential fallback logic during test fixes or refactoring
- Added clear code example and reasoning to prevent future mistakes

### Version 1.5
- **ADDED: React Testing Library best practices** - Critical guidance for testing context switching in React hooks
- Documented that `renderHook` with `rerender` does NOT work for context changes
- Established pattern: Use actual React components with `render`/`unmount`/`render` for context switching tests
- Added when-to-use guidelines for `renderHook` vs React components in testing
- **UPDATED: React Testing Patterns** - Added state manager prerequisites, Jest spy patterns, and real vs mocked dependency guidelines
- Documented requirement to set active conversation before testing message sending
- Added Jest spy expectation patterns and cleanup requirements

### Version 1.4
- **ADDED: Integration testing infrastructure** - Created comprehensive testing approach for package interoperability
- Added `apps/client-integration-tests` app using NX MCP generators instead of manual creation
- Implemented ARH client integration tests covering non-streaming messages, error handling, and configuration
- Documented NX MCP usage patterns for generating apps and maintaining workspace consistency
- Added test environment limitations documentation (Node.js Jest vs Web APIs)

### Version 1.3
- **REMOVED: setTemporaryStreamingHandler method** - Simplified architecture by removing temporary handler management
- Removed `setTemporaryStreamingHandler?<TChunk>()` from IAIClient interface in ai-client-common
- Updated test implementations to use default handlers configured at client initialization
- State managers now use client's default handlers directly without temporary injection
- Architecture simplified: clients configured with defaults → state managers wrap defaults → direct sendMessage calls

### Version 1.2
- **ADDED: NX version compatibility guidance** - Resolved @jscutlery/semver vs NX 21.x compatibility
- Installed `@nx/devkit@20.8.2` (compatible with @jscutlery/semver@5.6.1)
- Documented version constraints: @jscutlery/semver 5.6.1 only supports @nx/devkit ^18.0.0 || ^19.0.0 || ^20.0.0
- Future consideration: NX 21.x has native release functionality that could replace @jscutlery/semver

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

### **React Testing Patterns** (UPDATED)

When working with the `ai-react-state` package and React Testing Library:

#### **Context Switching Tests**
- **NEVER use `renderHook` with `rerender` for context changes** - it doesn't properly switch contexts
- **ALWAYS use actual React components** for testing context switching

```typescript
// ❌ WRONG - renderHook doesn't handle context switching properly
const { result, rerender } = renderHook(() => useHook(), { wrapper: wrapper1 });
rerender({ wrapper: wrapper2 }); // Context doesn't actually switch

// ✅ CORRECT - Use actual React components
const TestComponent = () => {
  const value = useHook();
  return <div data-testid="value">{value || 'null'}</div>;
};

const { unmount, getByTestId } = render(<TestComponent />, { wrapper: wrapper1 });
// ... test first context
unmount(); // Completely tear down React tree

const { getByTestId: getByTestId2 } = render(<TestComponent />, { wrapper: wrapper2 });
// Fresh React tree with new context
```

#### **State Manager Prerequisites**
- **ALWAYS set active conversation** before testing message sending: `stateManager.setActiveConversationId('test-id')`
- The state manager requires an active conversation before `sendMessage()` calls
- Use unique conversation IDs for each test to avoid cross-test interference

#### **Jest Spy Expectations**
- When testing function calls without optional parameters, use `toHaveBeenCalledWith(param)` not `toHaveBeenCalledWith(param, undefined)`
- JavaScript functions called with fewer parameters don't explicitly pass `undefined` to spy mocks

#### **When to Use Each Approach**
- **`renderHook`**: For testing hooks within the same context (state changes, event handling)
- **React components with `render`**: For testing context switching, provider changes, unmounting behavior

#### **Testing with Real vs Mocked Dependencies**
- **Use real state managers**: `createClientStateManager(mockClient)` instead of manually mocked objects
- **Use `jest.spyOn()`**: Spy on real methods instead of mocking entire objects
- **Always clean up spies**: Call `spy.mockRestore()` after each test 

### **Dependency Injection** (CRITICAL)
- **External dependencies (fetch, etc.) must be injectable**
- **Default fallbacks must be preserved** - NEVER remove the `|| new DefaultStreamingHandler()` pattern
- **Comprehensive error handling with custom error classes**
- **Full test coverage for public APIs**

### **ARH Client Default Handler Pattern** (CRITICAL - DO NOT MODIFY)
```typescript
// ALWAYS preserve this fallback pattern in ARH client constructor:
this.defaultStreamingHandler = config.defaultStreamingHandler || new DefaultStreamingHandler();
```
**Why this matters:**
- Provides sensible defaults for users who don't need custom streaming
- Enables the client to work out-of-the-box without complex configuration
- Critical for backward compatibility and ease of use
- **NEVER suggest removing this fallback - it's a core design pattern**

### **Test Server Lifecycle Management** (CRITICAL - DO NOT MODIFY)
**NEVER add server lifecycle management to Cypress tests:**
- **NO `pkill` commands** - Don't kill/restart servers in tests
- **NO `cy.exec()` server management** - Server lifecycle is handled externally
- **NO server startup/shutdown** - Tests assume servers are already running
- **Focus on API testing only** - Tests should verify application behavior, not manage infrastructure

**Why this matters:**
- Server lifecycle is managed by developers/CI systems
- Tests should be focused on application logic, not infrastructure
- Killing servers mid-test can affect other running tests
- Server management belongs in setup scripts, not test code 
