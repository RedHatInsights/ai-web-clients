# AI Agent Context Documentation
## AI Web Clients NX Workspace

> **Last Updated**: Context Version 3.0 (Modular Architecture)  
> **Workspace Version**: 1.0.0  
> **Context Version**: 3.0  
> **NX Version**: 21.3.3

---

## 📋 CONTEXT UPDATE INSTRUCTIONS

**FOR FUTURE AI AGENTS**: This modular context system MUST be updated whenever significant changes are made to the workspace. Each file focuses on a specific domain for better performance and maintainability.

**Update Process**:
1. Read the relevant domain-specific context file before making changes
2. Update the appropriate file(s) with new information
3. Increment the Context Version number in this main file
4. Add entry to Change Log section
5. Update cross-references between files as needed
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

## 📚 MODULAR CONTEXT SYSTEM

This workspace uses a modular context system for better performance and maintainability. Each file focuses on a specific domain:

### **Context Files**
- **[Development Guidelines](./DEVELOPMENT_GUIDELINES.md)** - Code standards, patterns, and NX usage
- **[Error Handling Patterns](./ERROR_HANDLING_PATTERNS.md)** - Error handling, race conditions, and recovery
- **[Testing Strategies](./TESTING_STRATEGIES.md)** - Testing frameworks, patterns, and approaches
- **[Package Patterns](./PACKAGE_PATTERNS.md)** - Package development templates and API patterns
- **[Technical Specifications](./TECHNICAL_SPECS.md)** - Workspace requirements and configurations

### **Quick Reference Commands**
```bash
# Run all tests (clean output)
NX_TUI=false npx nx run-many --target=test --all

# Run specific package tests
npx nx run arh-client:test

# Run integration tests
npx nx run client-integration-tests:test
```

---

## 🏗️ WORKSPACE ARCHITECTURE

```
ai-web-clients/
├── ai-rules/                # AI agent context files (modular)
│   ├── AI_CONTEXT.md        # This file - main overview
│   ├── DEVELOPMENT_GUIDELINES.md
│   ├── ERROR_HANDLING_PATTERNS.md
│   ├── TESTING_STRATEGIES.md
│   ├── PACKAGE_PATTERNS.md
│   └── TECHNICAL_SPECS.md
├── .eslintrc.json           # Workspace-wide ESLint config
├── .gitignore              # Git ignore patterns
├── .husky/                 # Git hooks for quality gates
├── jest.preset.js          # Jest configuration preset
├── jest.setup.js           # Jest setup for all packages
├── nx.json                 # NX workspace configuration
├── package.json            # Workspace root dependencies
├── project.json            # Workspace-level project config
├── tsconfig.json           # TypeScript base configuration
├── README.md               # Workspace documentation
└── packages/
    └── arh-client/         # IFD client package (reference implementation)
        ├── package.json    # Package-specific dependencies
        ├── project.json    # NX project configuration
        ├── src/           # Source code
        ├── USAGE.md       # Package usage documentation
        └── README.md      # Package-specific readme
```

---

## 🚀 GETTING STARTED

### **For New AI Agents**
1. Read this main context file first
2. Review the relevant domain-specific context files:
   - For code changes: [Development Guidelines](./DEVELOPMENT_GUIDELINES.md)
   - For bug fixes: [Error Handling Patterns](./ERROR_HANDLING_PATTERNS.md)
   - For testing: [Testing Strategies](./TESTING_STRATEGIES.md)
   - For new packages: [Package Patterns](./PACKAGE_PATTERNS.md)
3. Use `arh-client` as the reference implementation
4. Follow established patterns and update context when making significant changes

### **Critical First Steps**
- Always use NX executors for builds and tests
- Never use npm/yarn scripts directly for project operations
- Check `project.json` files for available targets
- Maintain the no-emoji policy workspace-wide

---

## 📝 CHANGE LOG

### Version 3.0 (Modular Architecture)
- **MAJOR: Context System Refactor** - Split large AI_CONTEXT.md into focused domain-specific files
- **NEW: Modular File Structure** - Created ai-rules directory with specialized context files
- **IMPROVED: Performance** - Smaller, focused context files reduce parsing overhead
- **ENHANCED: Maintainability** - Domain-specific files enable targeted updates
- **BETTER: Usability** - AI agents can load only relevant context for specific tasks

### Version 2.3
- **CRITICAL: Async Race Condition Pattern** - Identified and documented race condition pattern in async state management
- **setActiveConversationId Race Condition** - Fixed race condition where async function with void return type caused message persistence failures
- **Async/Await Requirement** - Added requirement that async state management functions must return Promises and be properly awaited
- **State Manager Interface Fix** - Updated `setActiveConversationId` from `void` to `Promise<void>` return type to prevent race conditions

### Version 2.2
- **NEW: Error Handling Testing Patterns** - Comprehensive testing approaches for initialization errors and user feedback
- **NEW: State Manager Error Recovery** - Enhanced error handling where state managers remain functional and display user-friendly error messages after initialization failures

### Version 2.1
- **NEW: Conversation Locking Feature** - Added comprehensive conversation locking functionality across all client packages
- **BREAKING: useActiveConversation API Change** - Hook now returns full conversation object instead of just ID string

---

## 🔗 REFERENCE LINKS

### **Package Examples**
- **IFD Client**: `packages/arh-client/` - Reference implementation
- **Usage Documentation**: `packages/arh-client/USAGE.md`

### **NX Documentation**
- [NX Workspace Configuration](https://nx.dev/reference/nx-json)
- [NX Project Configuration](https://nx.dev/reference/project-configuration)

---

**END OF MAIN CONTEXT DOCUMENTATION**

> This file serves as the entry point for AI agents working on the AI Web Clients NX workspace. For detailed information on specific domains, refer to the specialized context files in the ai-rules directory. When in doubt, refer to the `arh-client` package as the reference implementation.