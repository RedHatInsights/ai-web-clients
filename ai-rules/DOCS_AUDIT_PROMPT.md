# Docs audit

Go trough all the repository packages and also the root documentation file. Docs are usually stored i *.md files. Fix any inconsistencies in docs files. Use the source code ro verify the docs claims. Audit individual packages one by one and make sure that the follow is true:

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
   - **Streaming requirements** - All streaming examples MUST include `handleChunk` callback requirement
   - **Init method structure** - Document that `client.init()` returns `{ initialConversationId, conversations }`, not just a string
   - **fetchFunction patterns** - Always show arrow function usage: `fetchFunction: (input, init) => fetch(input, init)`
   - **Health check methods** - Verify actual method names per client (e.g., `healthCheck()` vs `livenessCheck()`)
   - **Configuration interfaces** - Document actual interface shapes, including optional properties like `initOptions`

9. **Type Export Documentation** (CRITICAL)
   - **Verify all TypeScript imports** - Ensure every type in documentation examples is actually exported
   - **Group exports logically** - Separate core types, data types, error types, handlers, and configuration in examples
   - **Check implementation types** - Don't document types that exist in source but aren't exported
   - **Update interface examples** - When interfaces change, update ALL documentation examples that reference them

Once you are done do a second round of verification to ensure the changes made are accurate.
