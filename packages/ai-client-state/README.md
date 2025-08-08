# @redhat-cloud-services/ai-client-state

State management for AI client conversations with event-driven architecture and cross-package compatibility.

## Features

- **Conversation Management** - Handle multiple AI conversations with persistent state
- **Conversation Locking** - Prevent message sending to locked conversations with automatic error handling
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
await stateManager.setActiveConversationId('conversation-id');

// Send messages (pass string directly, not Message object)
await stateManager.sendMessage('Hello AI!');
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

## Conversation Locking

The state manager supports conversation locking to prevent users from sending messages to conversations that are no longer active or have been archived. This feature provides a better user experience by preventing confusion and ensuring messages are only sent to appropriate conversations.

### How Conversation Locking Works

- **Locked conversations** prevent new messages from being sent
- **Automatic error handling** shows user-friendly messages when attempting to send to locked conversations
- **Client integration** allows AI clients to determine lock status based on their data
- **Event system** properly handles locked conversation scenarios

## Lazy Conversation Initialization

The state manager supports lazy conversation initialization, controlled by the AI client's `initOptions.initializeNewConversation` setting. This feature is documented in the [@redhat-cloud-services/ai-client-common](../ai-client-common#lazy-conversation-initialization) package.

### State Manager Behavior

**When initializeNewConversation: true (default):**
```typescript
const stateManager = createClientStateManager(client);
await stateManager.init(); // Creates/loads conversations immediately
// Ready to send messages to the active conversation
```

**When initializeNewConversation: false:**
```typescript
// Client configured with lazy initialization
const client = new AIClient({
  baseUrl: 'https://api.example.com',
  fetchFunction: customFetch,
  initOptions: { initializeNewConversation: false }
});

const stateManager = createClientStateManager(client);
await stateManager.init(); // No conversations created

// Conversation automatically created on first message
await stateManager.sendMessage('Hello'); // Creates conversation internally
```

The state manager automatically handles conversation creation when needed, ensuring users can always send messages regardless of the initialization setting.

## API Reference

### StateManager Interface

```typescript
export type StateManager<T extends Record<string, unknown> = Record<string, unknown>> = {
  // Initialization
  init(): Promise<void>;
  isInitialized(): boolean;
  isInitializing(): boolean;
  
  // Conversation Management
  setActiveConversationId(conversationId: string): Promise<void>;
  getActiveConversationId(): string | null;
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
  
  // Client Access
  getClient(): IAIClient<T>;
}

export type UserQuery = string;

export interface MessageOptions {
  stream?: boolean;
  [key: string]: unknown;
}

export enum Events {
  MESSAGE = 'message',
  ACTIVE_CONVERSATION = 'active-conversation',
  IN_PROGRESS = 'in-progress',
  CONVERSATIONS = 'conversations',
  INITIALIZING_MESSAGES = 'initializing-messages',
}
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

### Data Structures

```typescript
import { Message, Conversation } from '@redhat-cloud-services/ai-client-state';

// Message structure (automatically created by state manager)
interface Message<T = Record<string, unknown>> {
  id: string;
  answer: string;
  role: 'user' | 'bot';
  additionalAttributes?: T;
}

// Conversation structure
interface Conversation<T = Record<string, unknown>> {
  id: string;
  title: string;
  messages: Message<T>[];
  locked: boolean; // Prevents new messages when true
}

// Example: Messages are automatically created when you send strings
await stateManager.sendMessage('What is OpenShift?');
// This creates a user message internally and triggers the bot response

// Access messages from the conversation
const messages = stateManager.getActiveConversationMessages();
console.log('User message:', messages[0]); // { id: '...', answer: 'What is OpenShift?', role: 'user' }
console.log('Bot response:', messages[1]); // { id: '...', answer: 'OpenShift is...', role: 'bot' }
```

### Conversation Management

```typescript
// Set active conversation (async)
await stateManager.setActiveConversationId('conv-123');

// Get all conversations
const conversations = stateManager.getConversations();
console.log('All conversations:', conversations);

// Create new conversation
const newConversation = await stateManager.createNewConversation();
console.log('Created conversation:', newConversation.id);

// Get messages from active conversation
const messages = stateManager.getActiveConversationMessages();

// Access raw state for advanced use cases
const state = stateManager.getState();
console.log('All conversations:', state.conversations);
console.log('Active conversation:', state.activeConversationId);
```

## Sending Messages

> **Important**: The `sendMessage` method takes a string (`UserQuery`), not a `Message` object. The state manager automatically creates `Message` objects internally for both user input and bot responses.

### Basic Message Sending

```typescript
// Send non-streaming message (pass string directly)
const response = await stateManager.sendMessage('Explain Kubernetes pods');
console.log('Bot response:', response);
```

### Streaming Messages

```typescript
// Send streaming message (uses client's default streaming handler)
await stateManager.sendMessage('Tell me about container orchestration', { stream: true });

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

await stateManager.sendMessage('Your message here', options);
```

## Event System

### Available Events

```typescript
import { Events } from '@redhat-cloud-services/ai-client-state';

// Available Events:
// Events.MESSAGE - When messages are added/updated
// Events.ACTIVE_CONVERSATION - When active conversation changes  
// Events.IN_PROGRESS - When message sending status changes
// Events.CONVERSATIONS - When conversation list changes
// Events.INITIALIZING_MESSAGES - When conversation history is being loaded
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

// Subscribe to conversation list changes
const unsubscribeConversations = stateManager.subscribe(Events.CONVERSATIONS, () => {
  const conversations = stateManager.getConversations();
  console.log('Conversations updated:', conversations.length);
});

// Subscribe to message initialization events
const unsubscribeInitializing = stateManager.subscribe(Events.INITIALIZING_MESSAGES, () => {
  const isInitializing = stateManager.isInitializing();
  console.log('Messages initializing:', isInitializing);
});

// Cleanup subscriptions
unsubscribeMessages();
unsubscribeConversation();
unsubscribeProgress();
unsubscribeConversations();
unsubscribeInitializing();
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

// Create new conversations
const conversation1 = await stateManager.createNewConversation();
const conversation2 = await stateManager.createNewConversation();

// Switch between conversations  
await stateManager.setActiveConversationId(conversation1.id);
await stateManager.sendMessage('First message');

await stateManager.setActiveConversationId(conversation2.id); 
await stateManager.sendMessage('Second message');

// Get all conversations
const allConversations = stateManager.getConversations();
console.log('Total conversations:', allConversations.length);

// Access specific conversation from state
const state = stateManager.getState();
const conv1 = state.conversations[conversation1.id];
const conv2 = state.conversations[conversation2.id];
```

### Error Handling

```typescript
try {
  await stateManager.sendMessage('Your message here');
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
