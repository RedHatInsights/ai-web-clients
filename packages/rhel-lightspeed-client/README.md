# RHEL LightSpeed Client

TypeScript client for the RHEL LightSpeed RAG-based API.

## Overview

The RHEL LightSpeed client provides a TypeScript interface for interacting with the RHEL LightSpeed RAG (Retrieval Augmented Generation) system. This client is designed specifically for RHEL-related queries and system optimization tasks.

## Key Features

- **RAG System Integration**: Built for Retrieval Augmented Generation, not traditional conversation management
- **Real Server Compatibility**: Handles the actual RHEL LightSpeed API response format `{data: {text: string, request_id: string}}`
- **Context-Aware Queries**: Supports system information and terminal output context
- **No Streaming Support**: RAG system operates in non-streaming mode only
- **Single Conversation Model**: Uses constant conversation ID for all interactions
- **TypeScript Support**: Full type safety with comprehensive type definitions

## Installation

```bash
npm install @redhat-cloud-services/rhel-lightspeed-client
```

## Basic Usage

```typescript
import { RHELLightspeedClient } from '@redhat-cloud-services/rhel-lightspeed-client';

// Initialize the client
const client = new RHELLightspeedClient({
  baseUrl: 'https://your-rhel-lightspeed-api.com/api/lightspeed/v1',
  fetchFunction: fetch, // Optional, defaults to native fetch
});

// Initialize the client (returns empty conversations for RAG system)
await client.init();

// Send a simple question
const response = await client.sendMessage(
  'rhel-lightspeed-conversation', // Constant conversation ID
  'How do I check memory usage in RHEL?'
);

console.log(response.answer); // AI response text
console.log(response.messageId); // Request ID from server
```

## Advanced Usage

### With System Context

```typescript
// Send query with system context
const response = await client.sendMessage(
  'rhel-lightspeed-conversation',
  'How can I optimize this system?',
  {
    requestPayload: {
      context: {
        systeminfo: {
          os: 'Red Hat Enterprise Linux',
          version: '9.3',
          arch: 'x86_64',
          id: 'my-system-id',
        },
        terminal: {
          output: 'Load average: 5.2, Memory usage: 85%',
        },
      },
    },
  }
);

// Check if context metadata was generated
console.log(response.additionalAttributes?.context_metadata);
// Output: { has_systeminfo: true, has_terminal_output: true, ... }
```

### Skip RAG Retrieval

```typescript
// Bypass RAG retrieval for direct responses
const response = await client.sendMessage(
  'rhel-lightspeed-conversation',
  'Simple question without knowledge base lookup',
  {
    requestPayload: {
      skip_rag: true,
    },
  }
);

console.log(response.additionalAttributes?.rag_metadata?.skip_rag); // true
```

## API Reference

### RHELLightspeedClient

#### Constructor

```typescript
constructor(config: RHELLightspeedClientConfig)
```

#### Methods

##### `init(): Promise<{ conversations: IConversation[] }>`
Initialize the client. Always returns empty conversations array for RAG system.

##### `sendMessage(conversationId: string, message: string, options?: ISendMessageOptions): Promise<IMessageResponse>`
Send a message to the RHEL LightSpeed RAG system.

##### `createNewConversation(): Promise<IConversation>`
Returns the constant conversation object for RAG system.

##### `getConversationHistory(conversationId: string): Promise<[]>`
Always returns empty array for RAG system (no server-side persistence).


##### `healthCheck(): Promise<unknown>`
Check the health status of the RHEL LightSpeed API.

##### `getServiceStatus(): Promise<unknown>`
Get service status via metrics endpoint.

## Type Definitions

### Configuration

```typescript
interface RHELLightspeedClientConfig extends IBaseClientConfig {
  baseUrl: string;
  fetchFunction?: IFetchFunction;
}
```

### Request Payload

```typescript
interface RHELLightspeedRequestPayload {
  context?: {
    systeminfo?: {
      os?: string;
      version?: string;
      arch?: string;
      id?: string;
    };
    terminal?: {
      output?: string;
    };
  };
  skip_rag?: boolean;
}
```

### Response Additional Properties

```typescript
interface RHELLightspeedAdditionalProperties {
  rag_metadata?: {
    skip_rag: boolean;
    sources_consulted: number;
    knowledge_base_version: string;
    confidence_score: number;
  };
  context_metadata?: {
    has_systeminfo: boolean;
    has_terminal_output: boolean;
    has_attachments: boolean;
    has_stdin: boolean;
    has_cla_info: boolean;
  } | null;
  sources?: Array<{
    title: string;
    link: string;
    score: number;
    snippet: string;
  }>;
  original_question?: string;
}
```

## Error Handling

The client provides specific error types for different scenarios:

```typescript
import { 
  RHELLightspeedValidationError, 
  RHELLightspeedServerError 
} from '@redhat-cloud-services/rhel-lightspeed-client';

try {
  const response = await client.sendMessage('conv-id', 'question');
} catch (error) {
  if (error instanceof RHELLightspeedValidationError) {
    console.error('Validation error:', error.message);
  } else if (error instanceof RHELLightspeedServerError) {
    console.error('Server error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Integration with AI Client State

The RHEL LightSpeed client integrates seamlessly with the `@redhat-cloud-services/ai-client-state` package:

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

const stateManager = createClientStateManager(client);
await stateManager.init();

// Send messages through state manager
const response = await stateManager.sendMessage('How do I check disk usage?');
```

## RAG System Characteristics

This client is designed for RAG (Retrieval Augmented Generation) systems with specific behaviors:

- **Single Conversation**: Uses constant conversation ID `'rhel-lightspeed-conversation'`
- **No Streaming**: RAG responses are generated in one go, no real-time streaming
- **No Server Persistence**: All conversation state is managed client-side
- **Context-Aware**: Supports rich context including system info and terminal output
- **Knowledge Base Integration**: Leverages RHEL documentation and knowledge sources

## Development

### Mock Server

For development and testing, use the RHEL LightSpeed mock server:

```bash
cd apps/client-integration-tests
node rhel-lightspeed-mock-server.js
```

The mock server runs on `http://localhost:3005` and provides the same API interface as the real server.

### Testing

Run unit tests:
```bash
npx nx test rhel-lightspeed-client
```

Run integration tests:
```bash
npx nx run client-integration-tests:test --testPathPattern="rhel-lightspeed"
```

## License

This project is licensed under the terms specified in the workspace root.