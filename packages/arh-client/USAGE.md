# IFD Client Usage Guide

A flexible TypeScript client for the Intelligent Front Door (IFD) API with dependency injection support.

## Features

✅ **Complete API Coverage** - All 10 IFD API endpoints implemented  
✅ **Dependency Injection** - Custom fetch functions and streaming handlers  
✅ **TypeScript Support** - Full type safety with OpenAPI-generated types  
✅ **Flexible Configuration** - Custom fetch implementation control  
✅ **Error Handling** - Custom error types with proper HTTP status codes  
✅ **Streaming Support** - Built-in default streaming handler with native JS  

## Installation

```bash
npm install @redhat-cloud-services/arh-client
```

## Basic Usage

### 1. Create a Client with Authentication

```typescript
import { IFDClient, createAuthenticatedFetch } from '@redhat-cloud-services/arh-client';

const client = new IFDClient({
  baseUrl: 'https://ifd-001-prod-api.apps.ext-waf.spoke.prod.us-east-1.aws.paas.redhat.com',
  fetchFunction: createAuthenticatedFetch('your-jwt-token'),
});
```

### 2. Create a Conversation

```typescript
const conversation = await client.createConversation();
console.log('New conversation:', conversation.conversation_id);
```

### 3. Send a Non-Streaming Message

```typescript
const response = await client.sendMessage(conversation.conversation_id, {
  input: 'What is Red Hat OpenShift?',
});
console.log('Response:', response.output);
```

### 4. Send a Streaming Message

```typescript
import { DefaultStreamingHandler } from '@redhat-cloud-services/arh-client';

const streamHandler = new DefaultStreamingHandler();

await client.sendMessageStream(conversation.conversation_id, {
  input: 'Tell me more about OpenShift features',
}, {
  streamingHandler: streamHandler,
});
```

## Advanced Usage

### Custom Fetch Function

```typescript
import { IFetchFunction } from '@redhat-cloud-services/arh-client';

const customFetch: IFetchFunction = async (input, init) => {
  // Add custom authentication
  const token = await getAuthToken();
  
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      'Authorization': `Bearer ${token}`,
      'X-Request-ID': generateRequestId(),
    },
  });
};

const client = new IFDClient({ 
  baseUrl: 'https://your-api-url.com',
  fetchFunction: customFetch 
});
```

### Default Streaming Handler

The built-in `DefaultStreamingHandler` provides console logging and message accumulation:

```typescript
import { DefaultStreamingHandler } from '@redhat-cloud-services/arh-client';

const streamHandler = new DefaultStreamingHandler();

// Use it with streaming
await client.sendMessageStream(conversationId, { input: 'Your question' }, {
  streamingHandler: streamHandler,
});

// Access the complete message after streaming
const completeMessage = streamHandler.getCompleteMessage();
const messageId = streamHandler.getCurrentMessageId();
```

### Custom Streaming Handler

```typescript
import { IStreamingHandler, MessageChunkResponse } from '@redhat-cloud-services/arh-client';

class CustomStreamingHandler implements IStreamingHandler {
  private messageBuffer = '';

  onStart(conversationId: string, messageId: string): void {
    console.log('Stream started:', { conversationId, messageId });
    this.messageBuffer = '';
  }

  onChunk(chunk: MessageChunkResponse): void {
    this.messageBuffer = chunk.output;
    // Update UI with complete response so far
    updateUI(this.messageBuffer);
  }

  onComplete(finalChunk: MessageChunkResponse): void {
    console.log('Stream completed');
    console.log('Sources:', finalChunk.sources);
  }

  onError(error: Error): void {
    console.error('Stream error:', error);
    showErrorToUser(error.message);
  }
}
```

### Error Handling

```typescript
import { IFDApiError, IFDValidationError } from '@redhat-cloud-services/arh-client';

try {
  const response = await client.sendMessage(conversationId, { input: '' });
} catch (error) {
  if (error instanceof IFDValidationError) {
    console.log('Validation errors:', error.validationErrors);
  } else if (error instanceof IFDApiError) {
    console.log('API error:', error.status, error.data);
  } else {
    console.log('Network or other error:', error);
  }
}
```

## All Available Methods

```typescript
// Conversations
await client.createConversation();
await client.sendMessage(conversationId, messageRequest);
await client.sendMessageStream(conversationId, messageRequest, { streamingHandler });
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

## React Integration Example

```typescript
import { useState, useCallback } from 'react';
import { IFDClient, DefaultStreamingHandler } from '@redhat-cloud-services/arh-client';

export function useIFDStreaming(client: IFDClient) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<Error | null>(null);

  const sendStreamingMessage = useCallback(async (conversationId: string, input: string) => {
    const handler = new DefaultStreamingHandler();
    
    // Override methods for React state updates
    const originalOnStart = handler.onStart;
    handler.onStart = (convId, msgId) => {
      setIsStreaming(true);
      setMessage('');
      setError(null);
      originalOnStart.call(handler, convId, msgId);
    };
    
    const originalOnChunk = handler.onChunk;
    handler.onChunk = (chunk) => {
      setMessage(chunk.output);
      originalOnChunk.call(handler, chunk);
    };
    
    const originalOnComplete = handler.onComplete;
    handler.onComplete = (finalChunk) => {
      setIsStreaming(false);
      originalOnComplete.call(handler, finalChunk);
    };
    
    const originalOnError = handler.onError;
    handler.onError = (err) => {
      setError(err);
      setIsStreaming(false);
      originalOnError.call(handler, err);
    };

    try {
      await client.sendMessageStream(conversationId, { input }, { streamingHandler: handler });
    } catch (err) {
      setError(err as Error);
      setIsStreaming(false);
    }
  }, [client]);

  return { isStreaming, message, error, sendStreamingMessage };
}
```

## Configuration Options

```typescript
interface IFDClientConfig {
  // Required: The base URL for the API
  baseUrl: string;
  
  // Required: Custom fetch implementation
  fetchFunction: IFetchFunction;
}
```

## Request Options

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
  MessageRequest,
  MessageChunkResponse,
  ConversationHistoryResponse,
  UserResponse,
  QuotaStatusResponse,
  DefaultStreamingHandler,
  StreamingMessageChunk,
  // ... and many more
} from '@redhat-cloud-services/arh-client';
```

## Streaming Implementation

The client includes a **built-in default streaming handler** that:

- ✅ Uses **native JavaScript** (no lodash dependencies)
- ✅ Handles **JSON parsing** from streaming responses  
- ✅ Provides **error handling** for malformed streams
- ✅ **Accumulates message content** as chunks arrive
- ✅ Supports **console logging** for debugging
- ✅ Extracts **sources and metadata** from responses

You can use the `DefaultStreamingHandler` out-of-the-box or implement your own `IStreamingHandler` for custom behavior.

The streaming implementation handles various response formats and provides robust error handling for production use. 