# @redhat-cloud-services/arh-client

TypeScript client library for the Intelligent Front Door (IFD) API with comprehensive dependency injection support and streaming capabilities.

## Features

- **Complete API Coverage** - All 10 IFD API endpoints implemented
- **Conversation Management** - Automatic conversation locking based on `is_latest` status
- **Dependency Injection** - Custom fetch functions and streaming handlers
- **TypeScript Support** - Full type safety with OpenAPI-generated types
- **Streaming Support** - Built-in default streaming handler with native JavaScript
- **Error Handling** - Custom error types with proper HTTP status codes
- **Zero Runtime Dependencies** - Lightweight implementation following workspace standards

## Installation

```bash
npm install @redhat-cloud-services/arh-client
```

## Quick Start

```typescript
import { IFDClient } from '@redhat-cloud-services/arh-client';

// Initialize the client
const client = new IFDClient({
  baseUrl: 'https://your-ifd-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});

// Create a conversation
const conversation = await client.createNewConversation();

// Send a message
const response = await client.sendMessage(conversation.id, 'What is Red Hat OpenShift?');
console.log('Response:', response.answer);

// Send a streaming message (requires handleChunk callback)
await client.sendMessage(conversation.id, 'Tell me more about OpenShift features', {
  stream: true,
  handleChunk: (chunk) => {
    console.log('Streaming response:', chunk.answer);
  }
});
```

## API Compatibility

This client implements the `IAIClient` interface from `@redhat-cloud-services/ai-client-common`, making it compatible with the workspace state managers:

- `@redhat-cloud-services/ai-client-state` - Core state management
- `@redhat-cloud-services/ai-react-state` - React hooks and context

## Configuration

### Basic Configuration

```typescript
import { IFDClient } from '@redhat-cloud-services/arh-client';

const client = new IFDClient({
  baseUrl: 'https://your-ifd-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});
```

### Authenticated Configuration

```typescript
import { IFDClient } from '@redhat-cloud-services/arh-client';

const client = new IFDClient({
  baseUrl: 'https://your-ifd-api.com',
  fetchFunction: async (input, init) => {
    const token = await getAuthToken(); // Your token retrieval logic
    return fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        'Authorization': `Bearer ${token}`
      }
    });
  }
});
```

### Custom Fetch Implementation

**Note**: Do NOT set `'Content-Type'` headers in your fetchFunction - the client handles these internally based on endpoint requirements.

```typescript
import { IFetchFunction } from '@redhat-cloud-services/ai-client-common';

const customFetch: IFetchFunction = async (input, init) => {
  // Add custom authentication
  const token = await getAuthToken();
  
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      'Authorization': `Bearer ${token}`,
      'X-Request-ID': generateRequestId(),
      // DO NOT set 'Content-Type' - client handles this internally
    },
  });
};

const client = new IFDClient({ 
  baseUrl: 'https://your-api-url.com',
  fetchFunction: customFetch 
});
```

## Core Methods

### Conversation Management

```typescript
// Create a new conversation
const conversation = await client.createNewConversation();

// Send a non-streaming message
const response = await client.sendMessage(conversation.id, 'What is Red Hat OpenShift?');

// Get conversation history
const history = await client.getConversationHistory(conversation.id);
```

### Conversation Locking

The ARH client automatically manages conversation locking based on the `is_latest` property from the IFD API:

- **Latest conversations** (`is_latest: true`) are **unlocked** and can receive new messages
- **Older conversations** (`is_latest: false`) are **locked** and cannot receive new messages

```typescript
// Initialize client to get conversations with lock status
const result = await client.init();

// Check conversation lock status
result.conversations.forEach(conversation => {
  if (conversation.locked) {
    console.log(`Conversation "${conversation.title}" is locked (archived)`);
  } else {
    console.log(`Conversation "${conversation.title}" is active and can receive messages`);
  }
});

// Create new conversations (always unlocked)
const newConversation = await client.createNewConversation();
console.log('New conversation locked status:', newConversation.locked); // false
```

When used with the state manager from `@redhat-cloud-services/ai-client-state`, locked conversations are automatically handled:

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

const stateManager = createClientStateManager(client);
await stateManager.init(); // Loads conversations with proper lock status

// Attempting to send message to locked conversation will show error message
// instead of calling the API
await stateManager.setActiveConversationId('locked-conversation-id');
await stateManager.sendMessage('This will be blocked'); // Shows "conversation is locked" message
```

### Streaming Messages

```typescript
import { DefaultStreamingHandler } from '@redhat-cloud-services/arh-client';

// Create client with custom fetch function
const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});

// Streaming requires an handleChunk callback
await client.sendMessage(conversation.id, 'Tell me about OpenShift features', {
  stream: true,
  handleChunk: (chunk) => {
    console.log('Received chunk:', chunk.answer);
  }
});
```

### User Management

```typescript
// Get user settings
const settings = await client.getUserSettings();

// Update user settings
await client.updateUserSettings({
  preferences: { theme: 'dark' }
});

// Get user history
const userHistory = await client.getUserHistory(10);
```

### Feedback and Quotas

```typescript
// Send feedback for a message
await client.sendMessageFeedback(conversationId, messageId, {
  rating: 'positive',
  comment: 'Very helpful response'
});

// Check quotas
const conversationQuota = await client.getConversationQuota();
const messageQuota = await client.getMessageQuota(conversationId);
```

### Health Checks

```typescript
// Health check
await client.healthCheck();

// Service status
const status = await client.getServiceStatus();
```

## Streaming Support

### Default Streaming Handler

The built-in `DefaultStreamingHandler` provides:

- Console logging for debugging
- Message accumulation as chunks arrive
- Error handling for malformed streams
- Source extraction from responses

```typescript
// Streaming requires an handleChunk callback
await client.sendMessage(conversationId, 'Your question', { 
  stream: true,
  handleChunk: (chunk) => {
    // Process the streaming response
    console.log('Answer:', chunk.answer);
    console.log('Sources:', chunk.additionalAttributes?.sources);
  }
});
```

### Streaming Implementation

The ARH client uses self-contained streaming handlers internally. You only need to provide a `handleChunk` callback to process streaming responses. The client handles all the complexity of stream processing internally.

```typescript
import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';
import { IFDAdditionalAttributes } from '@redhat-cloud-services/arh-client';

// Simple streaming example - just provide handleChunk callback
await client.sendMessage(conversationId, 'Tell me about OpenShift', {
  stream: true,
  handleChunk: (chunk: IStreamChunk<IFDAdditionalAttributes>) => {
    // Receives IStreamChunk<IFDAdditionalAttributes> with processed data
    console.log('Current answer:', chunk.answer);
    console.log('Message ID:', chunk.messageId);
    console.log('Conversation ID:', chunk.conversationId);
    console.log('Sources:', chunk.additionalAttributes.sources);
    console.log('Tool calls:', chunk.additionalAttributes.tool_call_metadata);
    console.log('Quota info:', chunk.additionalAttributes.quota);
    
    // Update your UI with the incremental response
    updateUIWithAnswer(chunk.answer);
  }
});
```

## Error Handling

```typescript
import { IFDApiError, IFDValidationError } from '@redhat-cloud-services/arh-client';

try {
  const response = await client.sendMessage(conversationId, 'test');
} catch (error) {
  if (error instanceof IFDValidationError) {
    console.log('Validation errors:', error.validationErrors);
    error.validationErrors.forEach(validationError => {
      console.log(`Field: ${validationError.loc.join('.')}`);
      console.log(`Message: ${validationError.msg}`);
      console.log(`Type: ${validationError.type}`);
    });
  } else if (error instanceof IFDApiError) {
    console.log(`API Error ${error.status}: ${error.message}`);
    console.log('Response data:', error.data);
  } else {
    console.log('Network or other error:', error);
  }
}
```

## React Integration

```typescript
import { useState, useCallback } from 'react';
import { IFDClient } from '@redhat-cloud-services/arh-client';

export function useIFDStreaming(client: IFDClient) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<Error | null>(null);

  const sendStreamingMessage = useCallback(async (conversationId: string, input: string) => {
    try {
      setIsStreaming(true);
      setMessage('');
      setError(null);
      
      await client.sendMessage(conversationId, input, { 
        stream: true,
        handleChunk: (chunk) => {
          setMessage(chunk.answer);
        }
      });
      
      setIsStreaming(false);
    } catch (err) {
      setError(err as Error);
      setIsStreaming(false);
    }
  }, [client]);

  return { isStreaming, message, error, sendStreamingMessage };
}
```

## Complete API Reference

### All Available Methods

```typescript
// Conversations
await client.createNewConversation();
await client.sendMessage(conversationId, 'your message');
await client.sendMessage(conversationId, 'streaming message', { 
  stream: true,
  handleChunk: (chunk) => {
    console.log('Streaming:', chunk.answer);
  }
});
await client.getConversationHistory(conversationId);

// Feedback
await client.sendMessageFeedback(conversationId, messageId, feedbackRequest);

// User Management
await client.getUserSettings();
await client.updateUserSettings(userRequest);
await client.getUserHistory(limit);

// Quotas
await client.getConversationQuota();
await client.getMessageQuota(conversationId);

// Health & Status
await client.healthCheck();
await client.getServiceStatus();
```

### Configuration Interface

```typescript
interface IFDClientConfig {
  // Required: The base URL for the API
  baseUrl: string;
  
  // Optional: Custom fetch implementation (use arrow function, defaults to native fetch)
  fetchFunction?: IFetchFunction;
}
```

### Request Options

Individual methods support these options:

```typescript
interface RequestOptions {
  // Custom headers for the request
  headers?: Record<string, string>;
  
  // AbortSignal to cancel the request
  signal?: AbortSignal;
}
```

## TypeScript Types

All API types are exported for use in your application:

```typescript
import { 
  // Core response types
  MessageChunkResponse,
  NewConversationResponse,
  ConversationHistoryResponse,
  UserResponse,
  QuotaStatusResponse,
  UserHistoryResponse,
  MessageFeedbackResponse,
  HealthCheck,
  StatusChecks,
  
  // Request types
  MessageRequest,
  MessageFeedbackRequest,
  UserRequest,
  
  // Data types
  AnswerSource,
  ToolCallMetadata,
  OutputGuardResult,
  ValidationError,
  ConversationHistoryMessage,
  UserHistoryItem,
  ConversationQuotaStatus,
  MessageQuotaStatus,
  IFDAdditionalAttributes,
  
  // Streaming types
  StreamingMessageChunk,
  ProcessedMessage,
  TransformedSource,
  MessageExtraContentMetadata,
  
  // Error types
  IFDApiError,
  IFDValidationError,
  
  // Handlers and utilities
  DefaultStreamingHandler,
  isEmpty,
  isString,
  isObject,
  
  // Configuration
  IFDClientConfig,
  RequestOptions
} from '@redhat-cloud-services/arh-client';
```

## Compatible Packages

Works seamlessly with:

- **[@redhat-cloud-services/ai-client-state](../ai-client-state)** - State management for AI conversations
- **[@redhat-cloud-services/ai-react-state](../ai-react-state)** - React hooks and context provider
- **[@redhat-cloud-services/ai-client-common](../ai-client-common)** - Common interfaces and utilities

## Building

Run `nx build arh-client` to build the library.

## Running unit tests

Run `nx test arh-client` to execute the unit tests via [Jest](https://jestjs.io).

## Development

This package follows the workspace standards:
- Dependency injection for all external dependencies
- Comprehensive error handling with custom error classes
- TypeScript strict mode with no `any` types
- Zero runtime dependencies for optimal performance 