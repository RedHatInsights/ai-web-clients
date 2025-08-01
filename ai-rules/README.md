# AI Rules Directory
## Modular AI Context System

This directory contains the modular AI context system for the AI Web Clients NX workspace. The large monolithic `AI_CONTEXT.md` file has been split into focused, domain-specific files for better performance and maintainability.

---

## 📁 File Structure

### **Main Entry Point**
- **[AI_CONTEXT.md](./AI_CONTEXT.md)** - Main overview and navigation hub

### **Domain-Specific Context Files**
- **[DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)** - Code standards, patterns, and NX usage
- **[ERROR_HANDLING_PATTERNS.md](./ERROR_HANDLING_PATTERNS.md)** - Error handling, race conditions, and recovery
- **[TESTING_STRATEGIES.md](./TESTING_STRATEGIES.md)** - Testing frameworks, patterns, and approaches  
- **[PACKAGE_PATTERNS.md](./PACKAGE_PATTERNS.md)** - Package development templates and API patterns
- **[TECHNICAL_SPECS.md](./TECHNICAL_SPECS.md)** - Workspace requirements and configurations

---

## 🎯 Usage Guidelines

### **For AI Agents**
1. **Start with [AI_CONTEXT.md](./AI_CONTEXT.md)** - Get workspace overview
2. **Load relevant domain files** - Based on your specific task:
   - Code changes → [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)
   - Bug fixes → [ERROR_HANDLING_PATTERNS.md](./ERROR_HANDLING_PATTERNS.md)
   - Testing → [TESTING_STRATEGIES.md](./TESTING_STRATEGIES.md)
   - New packages → [PACKAGE_PATTERNS.md](./PACKAGE_PATTERNS.md)
   - Configuration → [TECHNICAL_SPECS.md](./TECHNICAL_SPECS.md)
3. **Update relevant files** when making changes
4. **Maintain cross-references** between related files

### **Benefits of Modular Approach**
- **Improved Performance**: Smaller files reduce parsing overhead
- **Better Focus**: Domain-specific information in dedicated files  
- **Easier Maintenance**: Updates target specific areas
- **Reduced Cognitive Load**: Less information to process per task
- **Modular Loading**: Load only relevant context for specific tasks

---

## 🔄 Migration Information

- **Migration Date**: Context Version 3.0
- **Previous File**: `../AI_CONTEXT.md` (now deprecated)
- **Backward Compatibility**: Previous file redirects to this system
- **Version Tracking**: Maintained in main [AI_CONTEXT.md](./AI_CONTEXT.md)

---

## 📝 Update Process

When updating context files:

1. **Read the relevant domain file** before making changes
2. **Update the appropriate file(s)** with new information
3. **Increment version number** in main [AI_CONTEXT.md](./AI_CONTEXT.md)
4. **Add changelog entry** in main file
5. **Update cross-references** between files as needed
6. **Test changes** across all packages

---

**For detailed workspace information, start with [AI_CONTEXT.md](./AI_CONTEXT.md)**