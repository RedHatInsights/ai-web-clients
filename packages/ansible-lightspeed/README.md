# @redhat-cloud-services/ansible-lightspeed

TypeScript client library for the Ansible Lightspeed API with dependency injection support for custom fetch implementations and streaming handlers.

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
npm install @redhat-cloud-services/ansible-lightspeed
```

## Quick Start

```typescript
import { AnsibleLightspeedClient } from '@redhat-cloud-services/ansible-lightspeed';

// Initialize the client
const client = new AnsibleLightspeedClient({
  baseUrl: 'https://your-ansible-lightspeed-api.com',
  fetchFunction: (input, init) => fetch(input, init), // Use arrow function to preserve context
  initOptions: {
    initializeNewConversation: false  // Optional: See ai-client-common docs
  }
});

// Initialize the client
const result = await client.init();
const conversationId = result.initialConversationId;

// Send a message
const response = await client.sendMessage(conversationId, 'Help me write an Ansible playbook');
console.log(response.answer);

// Stream a response (requires afterChunk callback)
await client.sendMessage(conversationId, 'Show me best practices for Ansible', {
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
interface AnsibleLightspeedConfig {
  baseUrl: string;
  fetchFunction: IFetchFunction;
  defaultStreamingHandler?: IStreamingHandler<StreamingEvent>;
  initOptions?: ClientInitOptions; // See ai-client-common docs for details
}
```

## Architecture

- **Dependency Injection**: External dependencies must be injectable for testability
- **Error Handling**: Custom error classes with proper HTTP status codes
- **Streaming Support**: Server-Sent Events (SSE) processing
- **Type Safety**: Strict TypeScript with no `any` types

## Core Methods

### Conversation Management

```typescript
// Initialize client to get conversation ID
const result = await client.init();
const conversationId = result.initialConversationId;

// Create a new conversation
const conversation = await client.createNewConversation();

// Send a non-streaming message
const response = await client.sendMessage(conversationId, 'How do I use Ansible with Kubernetes?');

// Get conversation history
const history = await client.getConversationHistory(conversationId);
```

### Streaming Messages

```typescript
import { DefaultStreamingHandler } from '@redhat-cloud-services/ansible-lightspeed';

// Create client with default streaming handler
const client = new AnsibleLightspeedClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: (input, init) => fetch(input, init),
  defaultStreamingHandler: new DefaultStreamingHandler()
});

await client.sendMessage(conversationId, 'Tell me about Ansible best practices', {
  stream: true,
  afterChunk: (response) => {
    console.log('Answer:', response.answer);
    console.log('Provider:', response.additionalAttributes?.provider);
  }
});
```

### Health Checks

```typescript
// Liveness check
await client.liveness();

// Readiness check
await client.readiness();

// Service status
const status = await client.status();
```

## Error Handling

```typescript
import { AnsibleLightspeedError } from '@redhat-cloud-services/ansible-lightspeed';

try {
  const response = await client.sendMessage(conversationId, 'your message');
} catch (error) {
  if (error instanceof AnsibleLightspeedError) {
    console.log(`API Error ${error.status}: ${error.message}`);
    console.log('Response data:', error.response);
  } else {
    console.log('Network or other error:', error);
  }
}
```

## Compatible Packages

Works seamlessly with:

- **[@redhat-cloud-services/ai-client-state](../ai-client-state)** - State management for AI conversations
- **[@redhat-cloud-services/ai-react-state](../ai-react-state)** - React hooks and context provider
- **[@redhat-cloud-services/ai-client-common](../ai-client-common)** - Common interfaces and utilities

## Building

Run `nx build ansible-lightspeed` to build the library.

## Running unit tests

Run `nx test ansible-lightspeed` to execute the unit tests via [Jest](https://jestjs.io).

## Available Methods

```typescript
// Core client methods
await client.init();
await client.sendMessage(conversationId, message, options);
await client.getConversationHistory(conversationId);
await client.createNewConversation();

// Conversation management
await client.getConversation(conversationId);
await client.deleteConversation(conversationId);

// Query operations
await client.query(request);
await client.streamingQuery(request);

// Feedback and status
await client.submitFeedback(feedback);
await client.getFeedbackStatus();
await client.checkAuthorization();

// Health checks
await client.getLiveness();
await client.getReadiness();
await client.healthCheck();

// Information and metrics
await client.getModels();
await client.getConfiguration();
await client.getMetrics();
```

## TypeScript Types

All API types are exported for use in your application:

```typescript
import {
  // Core types
  QueryRequest,
  QueryResponse,
  FeedbackRequest,
  FeedbackResponse,
  StatusResponse,
  ConversationResponse,
  ConversationDeleteResponse,
  ModelsResponse,
  InfoResponse,
  Configuration,
  ReadinessResponse,
  LivenessResponse,
  AuthorizedResponse,
  
  // Data types
  AnsibleLightspeedMessageAttributes,
  ReferencedDocument,
  StreamingEvent,
  
  // Error types
  AnsibleLightspeedError,
  
  // Handlers
  DefaultStreamingHandler,
  processStreamWithHandler,
  
  // Configuration
  AnsibleLightspeedConfig
} from '@redhat-cloud-services/ansible-lightspeed';
```

## Development

This package follows the workspace standards:
- Dependency injection for all external dependencies
- Comprehensive error handling with custom error classes
- TypeScript strict mode with no `any` types
- Zero runtime dependencies for optimal performance