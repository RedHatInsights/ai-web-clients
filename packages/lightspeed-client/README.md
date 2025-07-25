# @redhat-cloud-services/lightspeed-client

TypeScript client library for the OpenShift Lightspeed API with dependency injection support for custom fetch implementations and streaming handlers.

## Features

- Full TypeScript support with strict type checking
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

// Start a conversation
const conversationId = await client.init();

// Send a message
const response = await client.sendMessage(conversationId, 'How do I deploy a pod in OpenShift?');
console.log(response.answer);

// Stream a response
await client.sendMessage(conversationId, 'Tell me about OpenShift networking', {
  stream: true
});
```

## API Compatibility

This client implements the `IAIClient` interface from `@redhat-cloud-services/ai-client-common`, making it compatible with the workspace state managers:

- `@redhat-cloud-services/ai-client-state` - Core state management
- `@redhat-cloud-services/ai-react-state` - React hooks and context

## Configuration

The client requires a configuration object with dependency injection support:

```typescript
interface LightspeedClientConfig {
  baseUrl: string;
  fetchFunction: IFetchFunction;
  defaultStreamingHandler?: IStreamingHandler<MessageChunkResponse>;
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
// Initialize conversation
const conversationId = await client.init();

// Send non-streaming message
const response = await client.sendMessage(conversationId, 'How do I deploy a pod in OpenShift?');

// Send streaming message (requires default streaming handler configured)
await client.sendMessage(conversationId, 'Tell me about OpenShift networking', { stream: true });

// Get conversation history
const history = await client.getConversationHistory(conversationId);

// Health check
await client.healthCheck();
```

## Error Handling

```typescript
import { LightspeedClientError, LightspeedValidationError } from '@redhat-cloud-services/lightspeed-client';

try {
  const response = await client.sendMessage(conversationId, 'Your message');
} catch (error) {
  if (error instanceof LightspeedValidationError) {
    console.error('Validation errors:', error.validationErrors);
  } else if (error instanceof LightspeedClientError) {
    console.error(`API Error ${error.status}: ${error.message}`);
  }
}
```

## Documentation

See [USAGE.md](./USAGE.md) for detailed usage examples and API documentation.

## License

Apache 2.0 