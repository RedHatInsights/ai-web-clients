# @redhat-cloud-services/ai-client-common

Common interfaces and utilities for AI client packages in the Red Hat Cloud Services ecosystem.


## Features

- **Standardized AI Client Interface** - Common `IAIClient` interface for all AI services
- **Conversation Management** - Standard conversation interface with locking support
- **Dependency Injection** - Interfaces for custom fetch implementations and streaming handlers  
- **TypeScript Support** - Comprehensive type definitions for AI client development
- **Error Handling** - Base error classes with validation error support
- **Streaming Support** - Generic streaming handler interface for real-time responses
- **Zero Dependencies** - Pure TypeScript interfaces with no runtime dependencies

## Installation

```bash
npm install @redhat-cloud-services/ai-client-common
```

## Core Interfaces

### IAIClient Interface

All AI clients in this workspace implement the `IAIClient` interface:

```typescript
import { IAIClient, ClientInitLimitation, IInitErrorResponse } from '@redhat-cloud-services/ai-client-common';

declare class IAIClient<AP extends Record<string, unknown> = Record<string, unknown>> {
  constructor(config: IBaseClientConfig);
  
  init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
    error?: IInitErrorResponse;
  }>;
  
  // Basic message sending
  sendMessage<T extends Record<string, unknown> = Record<string, unknown>>(
    conversationId: string, 
    message: string, 
    options?: ISendMessageOptions<T>
  ): Promise<IMessageResponse<AP>>;
  
  // Message sending with custom request payload
  sendMessage<
    T extends Record<string, unknown> = Record<string, unknown>,
    R extends Record<string, unknown> = Record<string, unknown>
  >(
    conversationId: string, 
    message: string, 
    options?: ISendMessageOptions<T, R>
  ): Promise<IMessageResponse<AP>>;
  
  getConversationHistory(conversationId: string, options?: IRequestOptions): Promise<IConversationHistoryResponse<AP>>;
  
  healthCheck(options?: IRequestOptions): Promise<unknown>;
  
  getServiceStatus?(options?: IRequestOptions): Promise<unknown>;
  
  createNewConversation(): Promise<IConversation>;
}
```

### Dependency Injection

#### Custom Fetch Implementation

**Important**: Do NOT set `'Content-Type'` headers in your fetchFunction - AI clients manage these internally based on endpoint requirements.

```typescript
import { IFetchFunction } from '@redhat-cloud-services/ai-client-common';

const customFetch: IFetchFunction = async (input, init) => {
  // Add authentication headers
  const token = await getAuthToken();
  
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      'Authorization': `Bearer ${token}`,
      // DO NOT set 'Content-Type' - AI clients handle this internally
    },
  });
};
```

#### Base Client Configuration

```typescript
import { IBaseClientConfig } from '@redhat-cloud-services/ai-client-common';

const config: IBaseClientConfig = {
  baseUrl: 'https://your-ai-service.com',
  fetchFunction: customFetch // Optional - defaults to native fetch
};
```

#### Lazy Initialization (Default Behavior)

AI clients now use lazy initialization by default. The `init()` method no longer auto-creates conversations - instead, conversations are created automatically when needed (e.g., on first message send).

**Default Behavior:**
- Client `init()` only loads existing conversations
- No conversations are auto-created during initialization
- Conversations are created automatically on first `sendMessage()` call
- Provides optimal performance and seamless user experience

**Key Changes:**
- **Removed**: `ClientInitOptions` interface (no longer needed)
- **Removed**: `getInitOptions()` method from `IAIClient` interface
- **Removed**: `initialConversationId` from `init()` return type
- **New**: Automatic conversation creation on first message send

### Client Initialization Responses

The `init()` method returns additional information about client limitations and errors:

```typescript
import { ClientInitLimitation, IInitErrorResponse } from '@redhat-cloud-services/ai-client-common';

// Client limitations (e.g., quota exceeded)
type ClientInitLimitation = {
  reason: string;
  detail?: string;
};

// Initialization errors
interface IInitErrorResponse {
  message: string;
  status: number;
}

// Utility function to check if an object is an IInitErrorResponse
function isInitErrorResponse(obj: unknown): obj is IInitErrorResponse;
```

### Streaming Support

The streaming interface has been updated to standardize chunk handling across all AI clients. The `handleChunk` callback now receives an `IStreamChunk` object with standardized structure.

#### IStreamChunk Interface

```typescript
import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';

interface IStreamChunk<T extends Record<string, unknown> = Record<string, unknown>> {
  answer: string;
  messageId: string;
  conversationId: string;
  additionalAttributes: T;
}
```

#### Implementing a Custom Streaming Handler

```typescript
import { IStreamingHandler, HandleChunkCallback, IStreamChunk } from '@redhat-cloud-services/ai-client-common';

class CustomStreamingHandler<TChunk = unknown> implements IStreamingHandler<TChunk> {
  onChunk(chunk: TChunk, handleChunk?: HandleChunkCallback): void {
    console.log('Received chunk:', chunk);
    
    // Process the chunk and call handleChunk with standardized format
    if (handleChunk) {
      handleChunk({
        answer: extractAnswer(chunk), // Extract answer from chunk
        additionalAttributes: extractAttributes(chunk) // Extract additional data
      });
    }
  }

  onStart?(conversationId?: string, messageId?: string): void {
    console.log('Stream started', { conversationId, messageId });
  }

  onComplete?(finalChunk: TChunk): void {
    console.log('Stream completed:', finalChunk);
  }

  onError?(error: Error): void {
    console.error('Stream error:', error);
  }

  onAbort?(): void {
    console.log('Stream aborted');
  }
}
```

#### Send Message Options

```typescript
import { ISendMessageOptions, IStreamChunk } from '@redhat-cloud-services/ai-client-common';

// Basic streaming options
const streamingOptions: ISendMessageOptions = {
  stream: true,
  headers: { 'Custom-Header': 'value' },
  signal: abortController.signal,
  handleChunk: (chunk: IStreamChunk) => {
    // Process each standardized chunk as it arrives
    console.log('Answer:', chunk.answer);
    console.log('Message ID:', chunk.messageId);
    console.log('Conversation ID:', chunk.conversationId);
    console.log('Additional data:', chunk.additionalAttributes);
    updateUI(chunk.answer);
  }
};

// Options with custom request payload (client-specific)
const optionsWithPayload: ISendMessageOptions<AdditionalProps, CustomPayload> = {
  stream: false,
  headers: { 'X-Custom': 'value' },
  requestPayload: {
    // Client-specific payload data
    customData: 'value',
    options: { setting: true }
  }
};
```

#### Request Payload Support

The `ISendMessageOptions` interface supports method overloading to enable client-specific request payloads:

```typescript
// Interface definition
export interface ISendMessageOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
  R extends Record<string, unknown> = never
> extends IRequestOptions {
  stream?: boolean;
  handleChunk?: HandleChunkCallback<T>;
  requestPayload?: R extends never ? never : R;
}

// Usage with client-specific payload
interface MyClientPayload {
  context?: { systemInfo: string };
  skipCache?: boolean;
}

const response = await client.sendMessage(
  'conversation-id',
  'message',
  {
    requestPayload: {
      context: { systemInfo: 'linux' },
      skipCache: true
    }
  }
);
```

## Error Handling

### Base Error Classes

```typescript
import { 
  AIClientError, 
  AIClientValidationError 
} from '@redhat-cloud-services/ai-client-common';

try {
  const response = await client.sendMessage(conversationId, message);
} catch (error) {
  if (error instanceof AIClientValidationError) {
    console.error('Validation errors:', error.validationErrors);
    error.validationErrors.forEach(validationError => {
      console.log(`Field: ${validationError.loc.join('.')}`);
      console.log(`Message: ${validationError.msg}`);
      console.log(`Type: ${validationError.type}`);
    });
  } else if (error instanceof AIClientError) {
    console.error(`API Error ${error.status}: ${error.message}`);
    console.error('Response data:', error.data);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Type Definitions

### Request and Response Types

```typescript
import { 
  IRequestOptions,
  IMessageResponse,
  IConversationHistoryResponse,
  IConversation
} from '@redhat-cloud-services/ai-client-common';

// Standard request options
const options: IRequestOptions = {
  headers: { 'Custom-Header': 'value' },
  signal: new AbortController().signal
};

// Message response structure
interface IMessageResponse<AP = Record<string, unknown>> {
  messageId: string;
  answer: string;
  conversationId: string;
  date?: Date;
  additionalAttributes?: AP;
}

// Conversation structure
interface IConversation {
  id: string;
  title: string;
  locked: boolean; // Prevents new messages when true
  createdAt: Date;
}
```

## Compatible Packages

This package provides the foundation for:

- **[@redhat-cloud-services/arh-client](../arh-client)** - Intelligent Front Door (IFD) API client
- **[@redhat-cloud-services/lightspeed-client](../lightspeed-client)** - OpenShift Lightspeed API client
- **[@redhat-cloud-services/ansible-lightspeed](../ansible-lightspeed)** - Ansible Lightspeed API client
- **[@redhat-cloud-services/rhel-lightspeed-client](../rhel-lightspeed-client)** - RHEL LightSpeed RAG API client
- **[@redhat-cloud-services/aai-client](../aai-client)** - Ansible Assisted Installer API client
- **[@redhat-cloud-services/ai-client-state](../ai-client-state)** - State management for AI conversations
- **[@redhat-cloud-services/ai-react-state](../ai-react-state)** - React hooks and context for AI state

## Building

Run `nx build ai-client-common` to build the library.

## Running unit tests

Run `nx test ai-client-common` to execute the unit tests via [Jest](https://jestjs.io).

## Development

This package follows the workspace standards:
- Strict TypeScript with no `any` types
- Zero runtime dependencies  
- Comprehensive interface definitions
