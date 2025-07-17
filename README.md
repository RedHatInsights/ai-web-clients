# AI Web Clients Monorepo

NX monorepo for AI-related web client libraries, starting with the Intelligent Front Door (IFD) TypeScript client and OpenShift Lightspeed client. This workspace provides a complete ecosystem for building AI-powered web applications.

## Packages Overview

### 🤖 AI Client Libraries

#### [@redhat-cloud-services/arh-client](packages/arh-client/)
Intelligent Front Door (IFD) API TypeScript client with streaming support.

- **Features**: Full IFD API coverage, dependency injection, streaming handlers
- **Status**: Production ready
- **Usage**: `npm install @redhat-cloud-services/arh-client`

#### [@redhat-cloud-services/lightspeed-client](packages/lightspeed-client/)
OpenShift Lightspeed API TypeScript client with comprehensive feature support.

- **Features**: Complete Lightspeed API, streaming, health checks, feedback
- **Status**: Production ready  
- **Usage**: `npm install @redhat-cloud-services/lightspeed-client`

### 🧠 State Management

#### [@redhat-cloud-services/ai-client-common](packages/ai-client-common/)
Common interfaces and utilities for all AI client packages.

- **Features**: Standardized `IAIClient` interface, dependency injection interfaces, error classes
- **Status**: Foundation package
- **Usage**: `npm install @redhat-cloud-services/ai-client-common`

#### [@redhat-cloud-services/ai-client-state](packages/ai-client-state/)
Framework-agnostic state management for AI conversations.

- **Features**: Event-driven architecture, conversation management, message flow control
- **Status**: Production ready
- **Usage**: `npm install @redhat-cloud-services/ai-client-state`

#### [@redhat-cloud-services/ai-react-state](packages/ai-react-state/)
React hooks and context provider for AI state management.

- **Features**: React integration, custom hooks, TypeScript support
- **Status**: Production ready
- **Usage**: `npm install @redhat-cloud-services/ai-react-state`

### 🧪 Testing Applications

#### [client-integration-tests](apps/client-integration-tests/)
Integration test application for validating package interoperability.

- **Features**: Cross-package testing, live server integration, mocked responses
- **Status**: Development tool
- **Usage**: `npx nx test client-integration-tests`

#### [react-integration-tests](apps/react-integration-tests/)
React test application for UI component validation.

- **Features**: React component testing, UI integration examples
- **Status**: Development tool
- **Usage**: `npx nx serve react-integration-tests`

## Quick Start

### 1. Basic AI Client Usage

```typescript
import { IFDClient } from '@redhat-cloud-services/arh-client';

const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});

const conversation = await client.createConversation();
const response = await client.sendMessage(conversation.conversation_id, 'Hello AI!');

// Streaming usage
await client.sendMessage(conversation.conversation_id, 'Tell me about containers', {
  stream: true
});
```

### 2. With State Management

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';

const client = new IFDClient({ 
  baseUrl: 'https://your-api.com', 
  fetchFunction: (input, init) => fetch(input, init) 
});
const stateManager = createClientStateManager(client);

await stateManager.init();
await stateManager.sendMessage({ id: 'msg-1', answer: 'Hello!', role: 'user' });

// Streaming usage
await stateManager.sendMessage(
  { id: 'msg-2', answer: 'Explain Kubernetes', role: 'user' },
  { stream: true }
);
```

### 3. React Integration

#### Option A: Initialize Outside React Scope (Recommended)

```tsx
import React from 'react';
import { AIStateProvider, useSendMessage, useMessages } from '@redhat-cloud-services/ai-react-state';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';

// Initialize state manager outside React scope
const client = new IFDClient({ 
  baseUrl: 'https://your-api.com', 
  fetchFunction: (input, init) => fetch(input, init)
});

const stateManager = createClientStateManager(client);
// Initialize immediately when module loads
stateManager.init();

function App() {
  return (
    <AIStateProvider stateManager={stateManager}>
      <ChatInterface />
    </AIStateProvider>
  );
}

function ChatInterface() {
  const sendMessage = useSendMessage();
  const messages = useMessages();
  
  const handleSend = () => {
    const message = {
      id: `msg-${Date.now()}`,
      answer: 'Hello AI!',
      role: 'user' as const
    };
    sendMessage(message);
  };
  
  const handleStreamingSend = () => {
    const message = {
      id: `msg-${Date.now()}`,
      answer: 'Tell me about containers',
      role: 'user' as const
    };
    sendMessage(message, { stream: true });
  };
  
  return (
    <div>
      {messages.map(msg => <div key={msg.id}>{msg.answer}</div>)}
      <button onClick={handleSend}>Send</button>
      <button onClick={handleStreamingSend}>Send Streaming</button>
    </div>
  );
}
```

#### Option B: Initialize with useMemo

```tsx
import React, { useMemo } from 'react';
import { AIStateProvider, useSendMessage, useMessages } from '@redhat-cloud-services/ai-react-state';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';

function App() {
  const stateManager = useMemo(() => {
    // Create client with proper fetchFunction
    const client = new IFDClient({ 
      baseUrl: 'https://your-api.com', 
      fetchFunction: (input, init) => fetch(input, init)
    });
    
    // Create state manager (init will be called by provider)
    const manager = createClientStateManager(client);
    
    // Initialize async - once resolved, the client is ready
    manager.init();
    
    return manager;
  }, []);

  return (
    <AIStateProvider stateManager={stateManager}>
      <ChatInterface />
    </AIStateProvider>
  );
}

function ChatInterface() {
  const sendMessage = useSendMessage();
  const messages = useMessages();
  
  const handleSend = () => {
    const message = {
      id: `msg-${Date.now()}`,
      answer: 'Hello AI!',
      role: 'user' as const
    };
    sendMessage(message);
  };
  
  const handleStreamingSend = () => {
    const message = {
      id: `msg-${Date.now()}`,
      answer: 'Tell me about containers',
      role: 'user' as const
    };
    sendMessage(message, { stream: true });
  };
  
  return (
    <div>
      {messages.map(msg => <div key={msg.id}>{msg.answer}</div>)}
      <button onClick={handleSend}>Send</button>
      <button onClick={handleStreamingSend}>Send Streaming</button>
    </div>
  );
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Your Application                    │
├─────────────────────────────────────────────────────────┤
│  @redhat-cloud-services/ai-react-state (React Hooks)    │
├─────────────────────────────────────────────────────────┤
│  @redhat-cloud-services/ai-client-state (State Mgmt)    │
├─────────────────────────────────────────────────────────┤
│          AI Client Implementation                       │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │   arh-client        │  │   lightspeed-client     │   │
│  │   (IFD API)         │  │   (Lightspeed API)      │   │
│  └─────────────────────┘  └─────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @redhat-cloud-services/ai-client-common (Interfaces)   │
└─────────────────────────────────────────────────────────┘
```

## Key Benefits

- **🔗 Interoperability**: All packages implement common interfaces
- **🎯 Dependency Injection**: Testable and configurable clients  
- **📡 Streaming Support**: Real-time AI responses with custom handlers
- **⚛️ React Ready**: Purpose-built hooks and context providers
- **📦 Modular**: Use only what you need, from raw clients to full React integration
- **🔒 Type Safe**: Comprehensive TypeScript coverage across all packages
- **🧪 Well Tested**: Extensive integration tests and cross-package validation

## Package Dependencies

```
ai-client-common (foundation)
├── arh-client
├── lightspeed-client  
├── ai-client-state
│   └── ai-react-state
└── [your-custom-client]
```

## Development Workspace

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
