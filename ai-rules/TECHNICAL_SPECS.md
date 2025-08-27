# Technical Specifications
## AI Web Clients NX Workspace

> Part of the modular AI context system. See [AI_CONTEXT.md](./AI_CONTEXT.md) for overview.

---

## 🔧 TECHNICAL SPECIFICATIONS

### **Workspace Requirements**
- **Node.js**: 20+ (development dependencies target Node 20+)
- **npm**: Latest stable version
- **NX**: 21.3.3 (plugin-based architecture)
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
**Note**: Uses modern plugin-based architecture with automatic target inference.

Key features:
- Plugin-based project detection (`@nx/eslint/plugin`, `@nx/vite/plugin`)
- Native release system with independent versioning
- Advanced named inputs and target defaults
- Automatic target inference for builds and tests

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "defaultBase": "main",
  "plugins": [
    "@nx/eslint/plugin",
    "@nx/vite/plugin"
  ],
  "release": {
    "version": {
      "preVersionCommand": "npx nx run-many -t build",
      "generatorOptions": {
        "fallbackCurrentVersionResolver": "disk"
      }
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

## 🏗️ PROJECT STRUCTURE

### **Package Structure Template**
```
packages/{package-name}/
├── src/
│   ├── lib/
│   │   ├── client.ts              # Main client implementation
│   │   ├── interfaces.ts          # Dependency injection contracts
│   │   ├── types.ts               # API types and error classes
│   │   ├── default-streaming-handler.ts  # Default streaming implementation
│   │   └── index.ts               # Internal exports
│   ├── index.ts                   # Public API exports
│   └── examples.ts                # Usage examples (optional)
├── package.json                   # Package metadata and dependencies
├── project.json                   # NX project configuration
├── jest.config.ts                 # Jest configuration
├── tsconfig.json                  # TypeScript configuration
├── tsconfig.lib.json             # Library-specific TypeScript config
├── .eslintrc.json                # Package-specific ESLint rules
├── README.md                     # Package documentation
└── USAGE.md                      # Advanced usage examples
```

### **App Structure Template**
```
apps/{app-name}/
├── src/
│   ├── main.ts                   # Entry point
│   ├── *.spec.ts                 # Test files
│   └── lib/                      # Application-specific code
├── project.json                  # NX project configuration
├── jest.config.ts                # Jest configuration
├── tsconfig.json                 # TypeScript configuration
├── tsconfig.app.json             # App-specific TypeScript config
├── tsconfig.spec.json            # Test-specific TypeScript config
└── .eslintrc.json                # App-specific ESLint rules
```

---

## 📋 PACKAGE CONFIGURATION TEMPLATES

### **package.json Template**
```json
{
  "name": "@redhat-cloud-services/{package-name}",
  "version": "0.1.0",
  "description": "TypeScript client for {Service} API",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "exports": {
    ".": {
      "import": "./src/index.js",
      "types": "./src/index.d.ts"
    }
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/RedHatInsights/ai-web-clients.git",
    "directory": "packages/{package-name}"
  },
  "keywords": [
    "ai",
    "client",
    "typescript",
    "redhat"
  ],
  "author": "Red Hat, Inc.",
  "license": "Apache-2.0",
  "bugs": {
    "url": "https://github.com/RedHatInsights/ai-web-clients/issues"
  },
  "homepage": "https://github.com/RedHatInsights/ai-web-clients/tree/main/packages/{package-name}#readme",
  "peerDependencies": {},
  "dependencies": {},
  "devDependencies": {}
}
```

### **project.json Template**
```json
{
  "name": "{package-name}",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/{package-name}/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/{package-name}",
        "main": "packages/{package-name}/src/index.ts",
        "tsConfig": "packages/{package-name}/tsconfig.lib.json",
        "assets": [
          "packages/{package-name}/*.md",
          {
            "input": "./packages/{package-name}",
            "glob": "*.md",
            "output": "./"
          }
        ]
      }
    },
    "test": {
      "executor": "@nx/jest:jest",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": {
        "jestConfig": "packages/{package-name}/jest.config.ts"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["packages/{package-name}/**/*.ts"]
      }
    }
  },
  "tags": []
}
```

### **TypeScript Configuration Templates**

#### **tsconfig.json**
```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.lib.json"
    },
    {
      "path": "./tsconfig.spec.json"
    }
  ],
  "compilerOptions": {
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

#### **tsconfig.lib.json**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "declaration": true,
    "types": [],
    "target": "es2015",
    "importHelpers": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["jest.config.ts", "src/**/*.spec.ts", "src/**/*.test.ts"]
}
```

#### **tsconfig.spec.json**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "module": "commonjs",
    "types": ["jest", "node"],
    "importHelpers": false
  },
  "include": [
    "jest.config.ts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.d.ts"
  ]
}
```

### **Jest Configuration Template**
```typescript
/* eslint-disable */
export default {
  displayName: '{package-name}',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/{package-name}',
  setupFilesAfterEnv: ['../../jest.setup.js'],
};
```

---

## 🔌 DEPENDENCY MANAGEMENT

### **Dependency Policies**
- **Zero Runtime Dependencies**: Preferred for client packages
- **Peer Dependencies**: Use for framework integrations (React, etc.)
- **Dev Dependencies**: Testing, linting, build tools only
- **NO tslib**: Use `"importHelpers": false` in TypeScript config

### **Allowed Dependencies**
- **Testing**: Jest, @testing-library packages
- **Development**: TypeScript, ESLint, NX tools
- **Types**: @types/* packages for development

### **Forbidden Dependencies**
- **tslib**: Use native ES2015+ class inheritance
- **Runtime helpers**: Target modern JavaScript environments
- **Polyfills**: Assume modern browser/Node.js support

---

## ⚡ PERFORMANCE CONSIDERATIONS

### **Bundle Size Optimization**
- Tree-shaking friendly exports
- Minimal runtime dependencies
- ES2015+ targeting for smaller output
- Avoid TypeScript helpers via `importHelpers: false`

### **Build Performance**
- NX caching for builds and tests
- Incremental TypeScript compilation
- Parallel test execution
- Shared ESLint configuration

### **Runtime Performance**
- Native fetch API usage (Node.js 18+)
- Streaming support for large responses
- Efficient state management patterns
- Minimal memory footprint

---

## 🛡️ SECURITY CONSIDERATIONS

### **Authentication Patterns**
- Injectable fetch functions for custom auth
- No hardcoded credentials
- Support for bearer tokens, API keys
- Secure header management

### **API Security**
- Input validation and sanitization
- Proper error message handling
- No sensitive data in logs
- HTTPS-only communications

### **Package Security**
- Minimal dependency surface
- Regular security audits
- No secrets in package metadata
- Secure build and publish process

---

## 📊 MONITORING AND OBSERVABILITY

### **Logging Patterns**
- Structured logging support
- Configurable log levels
- No sensitive data in logs
- Error context preservation

### **Metrics Integration**
- Request/response timing
- Error rate tracking
- Usage statistics
- Performance monitoring hooks

### **Debugging Support**
- Source map generation
- Clear error messages
- Debug mode capabilities
- Development tooling integration

---

## 🚨 COMPATIBILITY REQUIREMENTS

### **Browser Support**
- Modern browsers with native fetch
- ES2015+ JavaScript support
- TypeScript compatibility
- React 16.8+ for React packages

### **Node.js Support**
- Node.js 18+ (for native fetch)
- CommonJS and ESM module support
- Jest testing environment
- NX CLI compatibility

### **Version Compatibility**
- **@jscutlery/semver**: 5.6.1 requires @nx/devkit ^18.0.0 || ^19.0.0 || ^20.0.0
- **NX**: 21.x has native release functionality
- **TypeScript**: 5.8.3 or compatible
- **Jest**: Latest stable with TypeScript support

---

> For development guidelines, see [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)  
> For package patterns, see [PACKAGE_PATTERNS.md](./PACKAGE_PATTERNS.md)  
> For testing strategies, see [TESTING_STRATEGIES.md](./TESTING_STRATEGIES.md)