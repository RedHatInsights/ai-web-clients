# AAI Client Usage Guide

This guide provides comprehensive examples and patterns for using the `@redhat-cloud-services/aai-client` package.

## Table of Contents

- [Installation and Setup](#installation-and-setup)
- [Basic Usage](#basic-usage)
- [Advanced Configuration](#advanced-configuration)
- [Error Handling](#error-handling)
- [Streaming Responses](#streaming-responses)
- [Conversation Management](#conversation-management)
- [Custom Fetch Implementation](#custom-fetch-implementation)
- [Integration with State Management](#integration-with-state-management)
- [API Reference](#api-reference)

## Installation and Setup

```bash
npm install @redhat-cloud-services/aai-client
```

```typescript
import { 
  AAIClient,
  AAIClientConfig,
  AAISendMessageOptions,
  AAIAdditionalAttributes,
  AAIDefaultStreamingHandler,
  parseSSEStream
} from '@redhat-cloud-services/aai-client';
```

## Basic Usage

### Initialize the Client

```typescript
const client = new AAIClient({
  baseUrl: 'https://your-aai-api-endpoint.com',
  fetchFunction: (input, init) => fetch(input, init)
});
```

### Send a Message

```typescript
// Create or get a conversation
const conversation = await client.createNewConversation();

// Send a message with streaming
const response = await client.sendMessage(
  conversation.id,
  'How do I configure Ansible Automation Platform?',
  {
    requestBody: {
      model: 'ansible-assistant',
      provider: 'openai',
      query: 'How do I configure Ansible Automation Platform?'
    },
    stream: true,
    afterChunk: (chunk) => {
      // Handle streaming response chunks
      console.log('Received chunk:', chunk.answer);
      
      // Access additional attributes
      if (chunk.additionalAttributes?.token_event) {
        console.log('Token:', chunk.additionalAttributes.token_event.token);
      }
    }
  }
);

console.log('Final response:', response.answer);
console.log('Message ID:', response.messageId);
console.log('Conversation ID:', response.conversationId);
```

## Advanced Configuration

### Custom Streaming Handler

```typescript
import { AAIDefaultStreamingHandler } from '@redhat-cloud-services/aai-client';

const customHandler = new AAIDefaultStreamingHandler((chunk) => {
  // Custom chunk processing
  console.log('Processing chunk:', chunk);
});

// Optional: Override handler methods
customHandler.onStart = (conversationId, messageId) => {
  console.log('Stream started:', { conversationId, messageId });
};

customHandler.onComplete = (fullResponse) => {
  console.log('Stream completed:', fullResponse);
};

customHandler.onError = (error) => {
  console.error('Stream error:', error);
};

const client = new AAIClient({
  baseUrl: 'https://your-aai-api.com',
  defaultStreamingHandler: customHandler
});
```

### Environment-Specific Configuration

```typescript
// Development configuration
const devClient = new AAIClient({
  baseUrl: 'https://dev-aai-api.com',
  fetchFunction: (input, init) => {
    console.log('API Request:', input, init);
    return fetch(input, init);
  }
});

// Production configuration
const prodClient = new AAIClient({
  baseUrl: 'https://prod-aai-api.com',
  fetchFunction: (input, init) => fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      'Authorization': `Bearer ${process.env.API_TOKEN}`
    }
  })
});
```

## Error Handling

### Comprehensive Error Handling

```typescript
async function sendMessageWithErrorHandling(
  client: AAIClient,
  conversationId: string,
  message: string
) {
  try {
    const response = await client.sendMessage(conversationId, message, {
      requestBody: {
        model: 'ansible-assistant',
        provider: 'openai',
        query: message
      },
      stream: true,
      afterChunk: (chunk) => {
        console.log('Chunk:', chunk.answer);
      }
    });
    
    return response;
  } catch (error) {
    if (error.message.includes('Expected text/event-stream')) {
      console.error('Server returned non-streaming response');
    } else if (error.message.includes('API request failed')) {
      console.error('API request failed:', error.message);
    } else if (error.message.includes('requestBody is required')) {
      console.error('Missing required requestBody in options');
    } else {
      console.error('Unexpected error:', error);
    }
    
    throw error;
  }
}
```

### Service Health Monitoring

```typescript
async function checkServiceHealth(client: AAIClient) {
  try {
    const status = await client.getServiceStatus();
    
    if (status['chatbot-service'] === 'ok' && 
        status['streaming-chatbot-service'] === 'ok') {
      console.log('All services healthy');
      return true;
    } else {
      console.warn('Service health issues:', status);
      return false;
    }
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}
```

## Streaming Responses

### Processing Different Event Types

```typescript
await client.sendMessage(conversationId, message, {
  requestBody: {
    model: 'ansible-assistant',
    provider: 'openai',
    query: message
  },
  stream: true,
  afterChunk: (chunk) => {
    const attrs = chunk.additionalAttributes;
    
    // Handle different event types
    if (attrs?.start_event) {
      console.log('Conversation started:', attrs.start_event.conversation_id);
    }
    
    if (attrs?.token_event) {
      const token = attrs.token_event;
      console.log(`Token [${token.id}] (${token.role}):`, token.token);
    }
    
    if (attrs?.tool_call_event) {
      const toolCall = attrs.tool_call_event;
      console.log(`Tool call [${toolCall.id}]:`, toolCall.token);
    }
    
    if (attrs?.turn_complete_event) {
      console.log('Turn completed:', attrs.turn_complete_event.token);
    }
    
    if (attrs?.end_event) {
      const endEvent = attrs.end_event;
      console.log('Response completed');
      console.log('Referenced documents:', endEvent.referenced_documents);
      console.log('Token usage:', {
        input: endEvent.input_tokens,
        output: endEvent.output_tokens
      });
    }
  }
});
```

### Manual SSE Stream Processing

```typescript
import { parseSSEStream, AAIDefaultStreamingHandler } from '@redhat-cloud-services/aai-client';

// For direct stream processing without the client
const response = await fetch('/api/v1/ai/streaming_chat/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'ansible-assistant',
    provider: 'openai',
    query: 'How do I install Ansible?'
  })
});

const handler = new AAIDefaultStreamingHandler((chunk) => {
  console.log('Manual chunk processing:', chunk);
});

const finalMessage = await parseSSEStream(response, handler);
console.log('Final message:', finalMessage);
```

## Conversation Management

### Working with Temporary Conversations

```typescript
// The client automatically handles temporary conversations
const tempConversation = await client.createNewConversation();
console.log('Temporary ID:', tempConversation.id); // "__aai_temp_conversation__"

// First message creates a real conversation
const response = await client.sendMessage(tempConversation.id, 'Hello', {
  requestBody: {
    model: 'ansible-assistant',
    provider: 'openai',
    query: 'Hello'
  },
  stream: true,
  afterChunk: (chunk) => {
    // Monitor for conversation ID changes
    if (chunk.additionalAttributes?.start_event?.conversation_id) {
      console.log('Real conversation created:', 
        chunk.additionalAttributes.start_event.conversation_id);
    }
  }
});

// Response contains the real conversation ID
console.log('Real conversation ID:', response.conversationId);
```

### Conversation State Tracking

```typescript
class ConversationTracker {
  private conversations = new Map<string, any>();
  
  async trackConversation(
    client: AAIClient,
    message: string,
    options: { model: string; provider: string }
  ) {
    // Start with temporary conversation
    let conversation = await client.createNewConversation();
    
    const response = await client.sendMessage(conversation.id, message, {
      requestBody: {
        model: options.model,
        provider: options.provider,
        query: message
      },
      stream: true,
      afterChunk: (chunk) => {
        console.log('Streaming:', chunk.answer);
      }
    });
    
    // Update with real conversation ID if changed
    if (response.conversationId !== conversation.id) {
      conversation.id = response.conversationId;
    }
    
    this.conversations.set(conversation.id, {
      ...conversation,
      lastMessage: response
    });
    
    return conversation;
  }
  
  getConversation(id: string) {
    return this.conversations.get(id);
  }
}
```

## Custom Fetch Implementation

### With Authentication

```typescript
const authenticatedClient = new AAIClient({
  baseUrl: 'https://secure-aai-api.com',
  fetchFunction: async (input, init) => {
    const token = await getAuthToken(); // Your auth logic
    
    return fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        'Authorization': `Bearer ${token}`,
        'X-API-Version': '1.0'
      }
    });
  }
});
```

### With Request/Response Logging

```typescript
const loggingClient = new AAIClient({
  baseUrl: 'https://aai-api.com',
  fetchFunction: async (input, init) => {
    console.log('REQUEST:', {
      url: input,
      method: init?.method || 'GET',
      headers: init?.headers,
      body: init?.body
    });
    
    const response = await fetch(input, init);
    
    console.log('RESPONSE:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    return response;
  }
});
```

### With Retry Logic

```typescript
const retryClient = new AAIClient({
  baseUrl: 'https://aai-api.com',
  fetchFunction: async (input, init) => {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(input, init);
        
        if (response.ok) {
          return response;
        }
        
        if (response.status >= 500 && attempt < maxRetries) {
          console.log(`Attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          console.log(`Attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError;
  }
});
```

## Integration with State Management

### Basic State Integration Pattern

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

// Create AAI client
const aaiClient = new AAIClient({
  baseUrl: 'https://aai-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});

// Create state manager
const stateManager = createClientStateManager(aaiClient);

// Initialize state
await stateManager.init();

// Send message through state manager
const response = await stateManager.sendMessage('How do I configure Ansible?', {
  stream: true,
  requestBody: {
    model: 'ansible-assistant',
    provider: 'openai',
    query: 'How do I configure Ansible?'
  }
});

// Access conversation state
const conversations = stateManager.getConversations();
const activeId = stateManager.getActiveConversationId();
const messages = stateManager.getActiveConversationMessages();
```

## API Reference

### Complete Method Signatures

#### AAIClient Methods

```typescript
// Constructor
constructor(config: AAIClientConfig)

// Core messaging
sendMessage(
  conversationId: string,
  message: string,
  options: AAISendMessageOptions
): Promise<IMessageResponse<AAIAdditionalAttributes>>

// Conversation management
createNewConversation(): Promise<IConversation>
getConversationHistory(
  conversationId: string,
  options?: IRequestOptions
): Promise<IConversationHistoryResponse<AAIAdditionalAttributes>>

// Health and status
healthCheck(options?: IRequestOptions): Promise<{ status: string }>
getServiceStatus(options?: IRequestOptions): Promise<{
  'chatbot-service': string;
  'streaming-chatbot-service': string;
}>

// Initialization
init(): Promise<{
  conversations: IConversation[];
  limitation?: ClientInitLimitation;
  error?: IInitErrorResponse;
}>

// Streaming
getDefaultStreamingHandler<TChunk>(): IStreamingHandler<TChunk> | undefined
```

#### Interface Definitions

```typescript
interface AAIClientConfig extends IBaseClientConfig<AAISSEEvent> {
  baseUrl: string;
  fetchFunction?: IFetchFunction;
  defaultStreamingHandler?: IStreamingHandler<AAISSEEvent>;
}

interface AAISendMessageOptions extends ISendMessageOptions<Record<string, unknown>> {
  requestBody: AAIRequestBody;
}

interface AAIRequestBody extends Record<string, unknown> {
  media_type?: string;      // Optional, defaults to "application/json"
  model: string;           // Required
  provider: string;        // Required
  query: string;           // Required (overridden by message parameter)
  conversation_id?: string; // Set automatically by client
}

type AAIAdditionalAttributes = {
  start_event?: {
    conversation_id?: string;
  };
  token_event?: {
    id?: number;
    role?: 'inference' | 'tool_execution';
    token?: string;
  };
  tool_call_event?: {
    id?: number;
    role?: 'inference' | 'tool_execution';
    token?: string;
  };
  turn_complete_event?: {
    id?: number;
    token?: string;
  };
  end_event?: {
    referenced_documents?: Array<{
      doc_url: string;
      doc_title: string;
    }>;
    input_tokens?: number;
    output_tokens?: number;
    available_quotas?: Record<string, unknown>;
  };
  [key: string]: unknown;
};

interface AAISSEEvent {
  event: 'start' | 'token' | 'tool_call' | 'turn_complete' | 'end' | 'error';
  data: Record<string, unknown>;
}
```

## Best Practices

1. **Always use streaming**: The AAI client only supports streaming responses
2. **Handle temporary conversations**: Be prepared for conversation ID changes
3. **Implement proper error handling**: Network issues and API errors should be handled gracefully
4. **Use TypeScript**: Take advantage of the full type safety provided
5. **Monitor service health**: Check service status before critical operations
6. **Custom fetch for auth**: Implement authentication in the fetchFunction
7. **Process all event types**: Handle different SSE event types appropriately