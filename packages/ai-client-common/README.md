# @redhat-cloud-services/ai-client-common


Common interfaces and utilities for AI client packages in the Red Hat Cloud Services ecosystem.

## Features

- **Standardized AI Client Interface** - Common `IAIClient` interface for all AI services
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
import { IAIClient } from '@redhat-cloud-services/ai-client-common';

interface IAIClient {
  init(): Promise<string>;
  sendMessage<TChunk = unknown>(
    conversationId: string, 
    message: string, 
    options?: ISendMessageOptions<TChunk>
  ): Promise<TChunk | IMessageResponse | void>;
  getDefaultStreamingHandler?<TChunk = unknown>(): IStreamingHandler<TChunk> | undefined;
  getConversationHistory(conversationId: string, options?: IRequestOptions): Promise<IConversationHistoryResponse>;
  healthCheck(options?: IRequestOptions): Promise<unknown>;
  getServiceStatus?(options?: IRequestOptions): Promise<unknown>;
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
  fetchFunction: customFetch,
  defaultStreamingHandler: new CustomStreamingHandler()
};
```

### Streaming Support

#### Implementing a Custom Streaming Handler

```typescript
import { IStreamingHandler } from '@redhat-cloud-services/ai-client-common';

class CustomStreamingHandler implements IStreamingHandler<string> {
  onChunk(chunk: string, afterChunk?: (chunk: string) => void): void {
    console.log('Received chunk:', chunk);
    // Process the chunk
    if (afterChunk) {
      afterChunk(chunk);
    }
  }

  onStart?(conversationId?: string, messageId?: string): void {
    console.log('Stream started', { conversationId, messageId });
  }

  onComplete?(finalChunk: string): void {
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

#### Streaming Request Options

```typescript
import { ISendMessageOptions } from '@redhat-cloud-services/ai-client-common';

const streamingOptions: ISendMessageOptions<string> = {
  stream: true,
  headers: { 'Custom-Header': 'value' },
  signal: abortController.signal,
  afterChunk: (chunk) => {
    // Process each chunk as it arrives
    updateUI(chunk);
  }
};
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
  IAPIResponse
} from '@redhat-cloud-services/ai-client-common';

// Standard request options
const options: IRequestOptions = {
  headers: { 'Custom-Header': 'value' },
  signal: new AbortController().signal
};

// Message response structure
interface IMessageResponse {
  messageId: string;
  answer: string;
  conversationId: string;
  createdAt?: string;
  metadata?: unknown;
}
```

## Compatible Packages

This package provides the foundation for:

- **[@redhat-cloud-services/arh-client](../arh-client)** - Intelligent Front Door (IFD) API client
- **[@redhat-cloud-services/lightspeed-client](../lightspeed-client)** - OpenShift Lightspeed API client  
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
