# @redhat-cloud-services/ai-client-state

State management for AI client conversations with event-driven architecture and cross-package compatibility.

## Features

- **Conversation Management** - Handle multiple AI conversations with persistent state
- **Event-Driven Architecture** - Subscribe to state changes with typed events
- **Message Flow Control** - Track message progress and handle streaming responses  
- **Client Agnostic** - Works with any AI client implementing `IAIClient` interface
- **TypeScript Support** - Comprehensive type definitions for all state operations
- **Zero UI Dependencies** - Pure state management without framework coupling

## Installation

```bash
npm install @redhat-cloud-services/ai-client-state
```

## Quick Start

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';

// Create any AI client (ARH, Lightspeed, etc.)
const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: (input, init) => fetch(input, init) // Arrow function to preserve context
});

// Create state manager
const stateManager = createClientStateManager(client);

// Initialize and start using
await stateManager.init();
stateManager.setActiveConversationId('conversation-id');

// Send messages
const userMessage = {
  id: 'msg-1',
  answer: 'Hello AI!',
  role: 'user' as const
};

await stateManager.sendMessage(userMessage);
```

## Critical: fetchFunction Configuration

**IMPORTANT**: When configuring the `fetchFunction` in AI clients, always use arrow functions or properly bound functions to preserve the `this` context and avoid reference issues.

**CRITICAL**: Do NOT set `'Content-Type'` headers in your fetchFunction - the AI client will set these internally based on the endpoint requirements. Setting custom Content-Type can interfere with the client's internal logic and cause request failures.

### ❌ Incorrect - Function Reference Issues

```typescript
// DON'T DO THIS - 'this' context can be lost
const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: fetch // Direct reference can cause context issues
});

// DON'T DO THIS - 'this' binding issues
const customFetch = function(input, init) {
  // 'this' may not refer to expected object
  return fetch(input, init);
};
```

### ✅ Correct - Arrow Functions (Recommended)

```typescript
// ALWAYS USE ARROW FUNCTIONS for fetchFunction
const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});
```

### ✅ Correct - Bound Functions

```typescript
// Alternative: Bind to window to preserve context
const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: fetch.bind(window)
});
```

### Authentication with Arrow Functions

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';

// Imaginary token retrieval function
async function getToken(): Promise<string> {
  // Your token retrieval logic here
  return 'your-jwt-token-here';
}

// CORRECT: Use arrow function for authenticated fetch
const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: async (input, init) => {
    const token = await getToken();
    
    return fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        'Authorization': `Bearer ${token}`
      }
    });
  }
});

const stateManager = createClientStateManager(client);
await stateManager.init();
```

### Complex Authentication Example

```typescript
// For more complex auth scenarios with error handling
const createAuthenticatedClient = async () => {
  const client = new IFDClient({
    baseUrl: 'https://your-api.com',
    fetchFunction: async (input, init) => {
      try {
        const token = await getToken();
        
        const response = await fetch(input, {
          ...init,
          headers: {
            ...init?.headers,
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'AI-Client/1.0'
            // DO NOT set 'Content-Type' - the client handles this internally
          }
        });

        // Handle token refresh if needed
        if (response.status === 401) {
          const newToken = await getToken(); // Refresh token
          return fetch(input, {
            ...init,
            headers: {
              ...init?.headers,
              'Authorization': `Bearer ${newToken}`
              // DO NOT set 'Content-Type' - the client handles this internally
            }
          });
        }

        return response;
      } catch (error) {
        console.error('Authentication error:', error);
        throw error;
      }
    }
  });

  return createClientStateManager(client);
};

// Usage
const stateManager = await createAuthenticatedClient();
await stateManager.init();
```

## Core Concepts

### State Manager

The state manager wraps any `IAIClient` and provides conversation state management:

```typescript
import { createClientStateManager, Events } from '@redhat-cloud-services/ai-client-state';

const stateManager = createClientStateManager(client);

// Initialize the state manager
await stateManager.init();

// Check initialization status
if (stateManager.isInitialized()) {
  console.log('State manager ready');
}

if (stateManager.isInitializing()) {
  console.log('State manager initializing...');
}
```

### Message Structure

```typescript
import { Message } from '@redhat-cloud-services/ai-client-state';

const userMessage: Message = {
  id: 'unique-message-id',
  answer: 'What is OpenShift?',
  role: 'user'
};

const botMessage: Message = {
  id: 'bot-response-id', 
  answer: 'OpenShift is a container platform...',
  role: 'bot'
};
```

### Conversation Management

```typescript
// Set active conversation
stateManager.setActiveConversationId('conv-123');

// Get messages from active conversation
const messages = stateManager.getActiveConversationMessages();

// Access raw state for advanced use cases
const state = stateManager.getState();
console.log('All conversations:', state.conversations);
console.log('Active conversation:', state.activeConversationId);
```

## Sending Messages

### Basic Message Sending

```typescript
const userMessage: Message = {
  id: 'msg-001',
  answer: 'Explain Kubernetes pods',
  role: 'user'
};

// Send non-streaming message
const response = await stateManager.sendMessage(userMessage);
console.log('Bot response:', response);
```

### Streaming Messages

```typescript
const userMessage: Message = {
  id: 'msg-002', 
  answer: 'Tell me about container orchestration',
  role: 'user'
};

// Send streaming message (uses client's default streaming handler)
await stateManager.sendMessage(userMessage, { stream: true });

// Messages are automatically updated as chunks arrive
const messages = stateManager.getActiveConversationMessages();
const botResponse = messages.find(m => m.role === 'bot');
console.log('Streaming response so far:', botResponse?.answer);
```

### Custom Message Options

```typescript
import { MessageOptions } from '@redhat-cloud-services/ai-client-state';

const options: MessageOptions = {
  stream: true,
  customHeader: 'value',
  // Any additional options are passed to the underlying client
};

await stateManager.sendMessage(userMessage, options);
```

## Event System

### Available Events

```typescript
import { Events } from '@redhat-cloud-services/ai-client-state';

// Events.MESSAGE - When messages are added/updated
// Events.ACTIVE_CONVERSATION - When active conversation changes  
// Events.IN_PROGRESS - When message sending status changes
```

### Subscribing to Events

```typescript
// Subscribe to message updates
const unsubscribeMessages = stateManager.subscribe(Events.MESSAGE, () => {
  const messages = stateManager.getActiveConversationMessages();
  console.log('Messages updated:', messages.length);
});

// Subscribe to conversation changes
const unsubscribeConversation = stateManager.subscribe(Events.ACTIVE_CONVERSATION, () => {
  const state = stateManager.getState();
  console.log('Active conversation changed:', state.activeConversationId);
});

// Subscribe to progress updates
const unsubscribeProgress = stateManager.subscribe(Events.IN_PROGRESS, () => {
  const isInProgress = stateManager.getMessageInProgress();
  console.log('Message in progress:', isInProgress);
});

// Cleanup subscriptions
unsubscribeMessages();
unsubscribeConversation();
unsubscribeProgress();
```

### Progress Tracking

```typescript
// Check if a message is currently being sent
const isInProgress = stateManager.getMessageInProgress();

if (isInProgress) {
  console.log('Please wait, message being processed...');
} else {
  console.log('Ready to send next message');
}
```

## Client Integration Examples

### ARH Client Integration

```typescript
import { IFDClient } from '@redhat-cloud-services/arh-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

const arhClient = new IFDClient({
  baseUrl: 'https://arh-api.redhat.com',
  fetchFunction: authenticatedFetch
});

const stateManager = createClientStateManager(arhClient);
await stateManager.init();
```

### Lightspeed Client Integration

```typescript
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

const lightspeedClient = new LightspeedClient({
  baseUrl: 'https://lightspeed-api.openshift.com',
  fetchFunction: (input, init) => fetch(input, init)
});

const stateManager = createClientStateManager(lightspeedClient);
await stateManager.init();
```

### Custom Client Integration

```typescript
import { IAIClient } from '@redhat-cloud-services/ai-client-common';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

class CustomClient implements IAIClient {
  async init(): Promise<string> {
    return 'initial-conversation-id';
  }

  async sendMessage(conversationId: string, message: string): Promise<any> {
    // Your custom implementation
    return { answer: 'Custom response', conversationId };
  }

  // ... implement other IAIClient methods
}

const customClient = new CustomClient();
const stateManager = createClientStateManager(customClient);
```

## Advanced Usage

### Multiple Conversation Handling

```typescript
// Create multiple conversations
await stateManager.init(); // Creates initial conversation
const initialConversationId = stateManager.getState().activeConversationId;

// Switch between conversations  
stateManager.setActiveConversationId('conversation-1');
await stateManager.sendMessage(userMessage1);

stateManager.setActiveConversationId('conversation-2'); 
await stateManager.sendMessage(userMessage2);

// Access specific conversation
const state = stateManager.getState();
const conversation1 = state.conversations['conversation-1'];
const conversation2 = state.conversations['conversation-2'];
```

### Error Handling

```typescript
try {
  await stateManager.sendMessage(userMessage);
} catch (error) {
  console.error('Failed to send message:', error);
  
  // State manager automatically cleans up failed messages
  const messages = stateManager.getActiveConversationMessages();
  // Failed bot message will be removed from conversation
}
```

### State Inspection

```typescript
const state = stateManager.getState();

console.log('Initialization status:', {
  isInitialized: state.isInitialized,
  isInitializing: state.isInitializing
});

console.log('Conversation state:', {
  activeConversationId: state.activeConversationId,
  conversationCount: Object.keys(state.conversations).length,
  messageInProgress: state.messageInProgress
});

// Access specific conversation details
Object.entries(state.conversations).forEach(([id, conversation]) => {
  console.log(`Conversation ${id}:`, {
    messageCount: conversation.messages.length,
    lastMessage: conversation.messages[conversation.messages.length - 1]
  });
});
```

## Compatible Packages

Works seamlessly with:

- **[@redhat-cloud-services/arh-client](../arh-client)** - Intelligent Front Door (IFD) API client
- **[@redhat-cloud-services/lightspeed-client](../lightspeed-client)** - OpenShift Lightspeed API client
- **[@redhat-cloud-services/ai-react-state](../ai-react-state)** - React hooks and context provider
- Any custom client implementing **[@redhat-cloud-services/ai-client-common](../ai-client-common)** interfaces

## Building

Run `nx build ai-client-state` to build the library.

## Running unit tests

Run `nx test ai-client-state` to execute the unit tests via [Jest](https://jestjs.io).

## Development

This package follows the workspace standards:
- Event-driven architecture with proper cleanup
- Comprehensive error handling and recovery
- TypeScript strict mode with full type coverage
- Zero UI framework dependencies for maximum compatibility
