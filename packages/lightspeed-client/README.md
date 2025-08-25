# @redhat-cloud-services/lightspeed-client

TypeScript client library for the OpenShift Lightspeed API with dependency injection support for custom fetch implementations and streaming handlers.

## Features

- Full TypeScript support with strict type checking
- Conversation management with locking support
- Dependency injection for custom fetch implementations
- Streaming and non-streaming message support
- Comprehensive error handling
- Health check and service status monitoring
- User feedback and authorization support
- Zero runtime dependencies (following workspace standards)

## Installation

```bash
npm install @redhat-cloud-services/lightspeed-client
```

## Quick Start

```typescript
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';

// Initialize the client
const client = new LightspeedClient({
  baseUrl: 'https://your-lightspeed-api.com',
  fetchFunction: (input, init) => fetch(input, init) // Use arrow function to preserve context
});

// Initialize the client
await client.init();

// Create a conversation
const conversation = await client.createNewConversation();

// Send a message
const response = await client.sendMessage(conversation.id, 'How do I deploy a pod in OpenShift?');
console.log(response.answer);

// Stream a response (requires afterChunk callback)
await client.sendMessage(conversation.id, 'Tell me about OpenShift networking', {
  stream: true,
  afterChunk: (response) => {
    console.log('Streaming response:', response.answer);
  }
});
```

## API Compatibility

This client implements the `IAIClient` interface from `@redhat-cloud-services/ai-client-common`, making it compatible with the workspace state managers:

- `@redhat-cloud-services/ai-client-state` - Core state management
- `@redhat-cloud-services/ai-react-state` - React hooks and context

## Configuration

The client requires a configuration object with dependency injection support:

```typescript
interface LightspeedClientConfig extends IBaseClientConfig<MessageChunkResponse> {
  // Inherits baseUrl, fetchFunction, and defaultStreamingHandler from IBaseClientConfig
  // All inherited properties are optional except baseUrl which is required
}
```

## Architecture

- **Dependency Injection**: External dependencies must be injectable for testability
- **Error Handling**: Custom error classes with proper HTTP status codes
- **Streaming Support**: Server-Sent Events (SSE) processing
- **Type Safety**: Strict TypeScript with no `any` types

## Core Methods

The LightspeedClient implements the same `IAIClient` interface as other AI clients in this workspace:

```typescript
// Initialize client
await client.init();

// Create a conversation
const conversation = await client.createNewConversation();

// Send non-streaming message
const response = await client.sendMessage(conversation.id, 'How do I deploy a pod in OpenShift?');

// Send streaming message (requires afterChunk callback)
await client.sendMessage(conversation.id, 'Tell me about OpenShift networking', { 
  stream: true,
  afterChunk: (response) => {
    console.log('Answer:', response.answer);
  }
});

// Get conversation history (Note: Lightspeed API doesn't support history - always returns empty array)
const history = await client.getConversationHistory(conversationId); // Returns []

// Health checks
await client.healthCheck(); // Combines readiness and liveness checks
await client.getServiceStatus();
```

## Conversation Management

The LightspeedClient supports conversation locking to manage conversation state:

```typescript
// Create new conversations (always unlocked)
const newConversation = await client.createNewConversation();
console.log('New conversation locked status:', newConversation.locked); // false

// Initialize client to get conversation list
const result = await client.init();
console.log('Available conversations:', result.conversations); // Currently returns empty array
```

When used with the state manager from `@redhat-cloud-services/ai-client-state`, conversation locking is fully supported:

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

const stateManager = createClientStateManager(client);
await stateManager.init();

// Create and use conversations with automatic lock management
const conversation = await stateManager.createNewConversation();
await stateManager.setActiveConversationId(conversation.id);
await stateManager.sendMessage('Hello!');
```

**Note**: Unlike the ARH client, LightspeedClient does not automatically set conversation lock status based on API responses. Lock status can be managed manually or through the state manager.

## Error Handling

```typescript
import { LightspeedClientError, LightspeedValidationError } from '@redhat-cloud-services/lightspeed-client';

try {
  const response = await client.sendMessage(conversationId, 'Your message');
} catch (error) {
  if (error instanceof LightspeedValidationError) {
    console.error('Validation errors:', error.validationErrors);
    error.validationErrors.forEach(validationError => {
      console.log(`Field: ${validationError.loc.join('.')}`);
      console.log(`Message: ${validationError.msg}`);
      console.log(`Type: ${validationError.type}`);
    });
  } else if (error instanceof LightspeedClientError) {
    console.error(`API Error ${error.status}: ${error.message}`);
    console.error('Response:', error.response);
  }
}
```

## API Limitations

**Conversation History**: The Lightspeed API v1.0.1 does not provide a conversation history endpoint. The `getConversationHistory()` method is implemented for interface compliance but always returns an empty array and logs a warning.

## Available Methods

```typescript
// Core client methods
await client.init();
await client.sendMessage(conversationId, message, options);
await client.getConversationHistory(conversationId); // Returns [] - not supported by Lightspeed API
await client.createNewConversation();

// Health checks
await client.healthCheck(); // Combines readiness and liveness checks
await client.getServiceStatus();

// Feedback and authorization
await client.storeFeedback(feedback);
await client.checkAuthorization(userId);

// Metrics
await client.getMetrics();
```

## TypeScript Types

All API types are exported for use in your application:

```typescript
import {
  // Core types
  LLMRequest,
  LLMResponse,
  MessageChunkResponse,
  FeedbackRequest,
  FeedbackResponse,
  StatusResponse,
  AuthorizationResponse,
  ReadinessResponse,
  LivenessResponse,
  HealthCheck,
  
  // Data types
  Attachment,
  LightSpeedCoreAdditionalProperties,
  
  // Error types
  LightspeedClientError,
  LightspeedValidationError,
  
  // Handlers
  DefaultStreamingHandler,
  processStreamWithHandler,
  
  // Configuration
  LightspeedClientConfig,
  RequestOptions
} from '@redhat-cloud-services/lightspeed-client';
```

## Compatible Packages

Works seamlessly with:

- **[@redhat-cloud-services/ai-client-state](../ai-client-state)** - State management for AI conversations
- **[@redhat-cloud-services/ai-react-state](../ai-react-state)** - React hooks and context provider
- **[@redhat-cloud-services/ai-client-common](../ai-client-common)** - Common interfaces and utilities

## Building

Run `nx build lightspeed-client` to build the library.

## Running unit tests

Run `nx test lightspeed-client` to execute the unit tests via [Jest](https://jestjs.io).

## Development

This package follows the workspace standards:
- Dependency injection for all external dependencies
- Comprehensive error handling with custom error classes
- TypeScript strict mode with no `any` types
- Zero runtime dependencies for optimal performance

## License

Apache 2.0 