# @redhat-cloud-services/aai-client

TypeScript client library for the Ansible Assisted Installer (AAI) API with Server-Sent Events streaming support.

## Features

- Full TypeScript support with strict type checking
- Server-Sent Events streaming for real-time responses
- Dependency injection for custom fetch implementations
- Conversation management with temporary conversation support
- Comprehensive error handling
- Health check and service status monitoring
- Zero runtime dependencies

## Installation

```bash
npm install @redhat-cloud-services/aai-client
```

## Quick Start

```typescript
import { AAIClient, AAIAdditionalAttributes } from '@redhat-cloud-services/aai-client';
import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';

// Initialize the client
const client = new AAIClient({
  baseUrl: 'https://your-aai-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});

// Check service status
const status = await client.getServiceStatus();
console.log('Service status:', status);

// Create a conversation
const conversation = await client.createNewConversation();

// Send a message (streaming is required)
const response = await client.sendMessage(conversation.id, 'Help me install OpenShift', {
  requestBody: {
    model: 'your-model',
    provider: 'your-provider',
    query: 'Help me install OpenShift'
  },
  stream: true,
  handleChunk: (chunk: IStreamChunk<AAIAdditionalAttributes>) => {
    console.log('Streaming response:', chunk.answer);
    console.log('Conversation ID:', chunk.conversationId);
  }
});

console.log('Final response:', response);
```

## Core Concepts

### Streaming-Only Support

The AAI client only supports streaming responses via Server-Sent Events. All message sending must include `stream: true` and an `handleChunk` callback.

### Temporary Conversations

The client handles temporary conversations automatically. When no conversation ID is provided or when using temporary conversation IDs (`__temp_conversation__`, `__aai_temp_conversation__`), the client will omit the conversation_id from the request, allowing the server to create a new conversation.

## API Reference

### AAIClient Class

#### Constructor

```typescript
new AAIClient(config: AAIClientConfig)
```

**Parameters:**
- `config.baseUrl` (string): The base URL of the AAI API
- `config.fetchFunction` (optional): Custom fetch implementation

#### Methods

##### `sendMessage(conversationId, message, options)`

Sends a message to the AAI service via Server-Sent Events.

```typescript
sendMessage(
  conversationId: string,
  message: string,
  options: AAISendMessageOptions
): Promise<IMessageResponse<AAIAdditionalAttributes>>
```

**Parameters:**
- `conversationId`: The conversation ID (or temporary ID)
- `message`: The message text to send
- `options.requestBody`: Required request body with model, provider, and query
- `options.stream`: Must be `true` for streaming
- `options.handleChunk`: Callback function for streaming responses

**Required requestBody fields:**
- `model` (string): The AI model to use
- `provider` (string): The AI provider
- `query` (string): The query text (overridden by message parameter)
- `media_type` (optional): Media type, defaults to "application/json"

##### `getServiceStatus()`

Checks the health status of the AAI service.

```typescript
getServiceStatus(): Promise<{
  'chatbot-service': string;
  'streaming-chatbot-service': string;
}>
```

##### `createNewConversation()`

Creates a new temporary conversation.

```typescript
createNewConversation(): Promise<IConversation>
```

Returns a temporary conversation object with ID `__aai_temp_conversation__`.

##### `healthCheck()`

Performs a basic health check.

```typescript
healthCheck(): Promise<{ status: string }>
```


## Types and Interfaces

### AAIClientConfig

```typescript
interface AAIClientConfig extends IBaseClientConfig {
  baseUrl: string;
  fetchFunction?: IFetchFunction;
}
```

### AAISendMessageOptions

```typescript
interface AAISendMessageOptions extends ISendMessageOptions<Record<string, unknown>> {
  requestBody: AAIRequestBody;
}
```

### AAIRequestBody

```typescript
interface AAIRequestBody extends Record<string, unknown> {
  media_type?: string;
  model: string;
  provider: string;
  query: string;
  conversation_id?: string;
}
```

### AAIAdditionalAttributes

Response attributes specific to AAI, including:
- `start_event`: Conversation start information
- `token_event`: Streaming token data
- `tool_call_event`: Tool execution events
- `turn_complete_event`: Turn completion data
- `end_event`: Response metadata and referenced documents

## Error Handling

```typescript
import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';
import { AAIAdditionalAttributes } from '@redhat-cloud-services/aai-client';

try {
  const response = await client.sendMessage(conversationId, message, {
    requestBody: {
      model: 'your-model',
      provider: 'your-provider',
      query: message
    },
    stream: true,
    handleChunk: (chunk: IStreamChunk<AAIAdditionalAttributes>) => {
      console.log('Chunk:', chunk.answer);
      console.log('Conversation ID:', chunk.conversationId);
    }
  });
} catch (error) {
  console.error('AAI client error:', error.message);
}
```

## Advanced Usage

For more detailed examples and advanced usage patterns, see [USAGE.md](./USAGE.md).

## Dependencies

This package depends on:
- `@redhat-cloud-services/ai-client-common`: Common interfaces and types

## License

Licensed under the terms specified in the workspace root.