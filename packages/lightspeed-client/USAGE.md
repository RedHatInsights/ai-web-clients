# Lightspeed Client Usage Guide

This guide provides comprehensive examples and API documentation for the `@redhat-cloud-services/lightspeed-client` package.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Streaming Messages](#streaming-messages)
- [Error Handling](#error-handling)
- [Health Checks](#health-checks)
- [Feedback and Authorization](#feedback-and-authorization)
- [State Manager Integration](#state-manager-integration)
- [Custom Fetch Implementation](#custom-fetch-implementation)

## Basic Usage

### Initializing the Client

```typescript
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';

const client = new LightspeedClient({
  baseUrl: 'https://lightspeed-api.openshift.com',
  fetchFunction: (input, init) => fetch(input, init)
});
```

### Sending Messages

```typescript
// Start a conversation
const conversationId = await client.init();

// Send a non-streaming message
const response = await client.sendMessage(
  conversationId, 
  'How do I create a deployment in OpenShift?'
);

console.log('AI Response:', response.answer);
console.log('Conversation ID:', response.conversationId);
console.log('Referenced Documents:', response.additionalAttributes?.referencedDocuments);
```

## Configuration

### Complete Configuration Example

```typescript
import { 
  LightspeedClient, 
  DefaultStreamingHandler,
  MessageChunkResponse 
} from '@redhat-cloud-services/lightspeed-client';

// Custom streaming handler
class CustomStreamingHandler implements IStreamingHandler<MessageChunkResponse> {
  onChunk(chunk: MessageChunkResponse): void {
    // Custom chunk processing
    if (chunk.content) {
      console.log('Received:', chunk.content);
    }
  }
  
  onComplete(finalChunk: MessageChunkResponse): void {
    console.log('Stream completed');
  }
  
  onError(error: Error): void {
    console.error('Stream error:', error);
  }
}

const client = new LightspeedClient({
  baseUrl: process.env.LIGHTSPEED_API_URL,
  fetchFunction: (input, init) => fetch(input, init),
  defaultStreamingHandler: new CustomStreamingHandler()
});
```

## Streaming Messages

### Basic Streaming

```typescript
// Enable streaming mode
await client.sendMessage(conversationId, 'Explain OpenShift networking', {
  stream: true
});

// The default streaming handler will process chunks automatically
```

### Custom Streaming Processing

```typescript
await client.sendMessage(conversationId, 'Tell me about pods', {
  stream: true,
  afterChunk: (chunk) => {
    // Process each chunk as it arrives
    if (chunk.finished) {
      console.log('Streaming completed');
    }
  }
});
```

## Error Handling

### Handling Different Error Types

```typescript
import { 
  LightspeedClientError, 
  LightspeedValidationError 
} from '@redhat-cloud-services/lightspeed-client';

try {
  const response = await client.sendMessage(conversationId, 'Your question');
} catch (error) {
  if (error instanceof LightspeedValidationError) {
    console.error('Validation error:', error.validationErrors);
  } else if (error instanceof LightspeedClientError) {
    console.error(`API error ${error.status}: ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Request Timeout and Cancellation

```typescript
const controller = new AbortController();

// Cancel request after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
  const response = await client.sendMessage(conversationId, 'Your question', {
    signal: controller.signal
  });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

## Health Checks

### Service Health Monitoring

```typescript
// Check overall service health
const healthStatus = await client.healthCheck();

console.log('Status:', healthStatus.status); // 'healthy' or 'unhealthy'
console.log('Ready:', healthStatus.ready);
console.log('Alive:', healthStatus.alive);
console.log('Reason:', healthStatus.reason);

// Check specific service status
const serviceStatus = await client.getServiceStatus();
console.log('Feedback functionality:', serviceStatus.functionality);
console.log('Status details:', serviceStatus.status);
```

## Feedback and Authorization

### Storing User Feedback

```typescript
import { FeedbackRequest } from '@redhat-cloud-services/lightspeed-client';

const feedback: FeedbackRequest = {
  conversation_id: conversationId,
  user_question: 'How do I deploy a pod?',
  llm_response: 'To deploy a pod in OpenShift...',
  sentiment: 1, // Positive feedback
  user_feedback: 'This was very helpful!'
};

const result = await client.storeFeedback(feedback);
console.log('Feedback stored:', result.response);
```

### User Authorization

```typescript
// Check if user is authorized
try {
  const authResponse = await client.checkAuthorization();
  console.log('User ID:', authResponse.user_id);
  console.log('Username:', authResponse.username);
} catch (error) {
  console.error('User not authorized:', error);
}

// With user ID for no-op auth
const authResponse = await client.checkAuthorization('user123');
```

## State Manager Integration

### Using with AI Client State Manager

```typescript
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';

// Create the client
const lightspeedClient = new LightspeedClient({
  baseUrl: 'https://lightspeed-api.openshift.com',
  fetchFunction: (input, init) => fetch(input, init)
});

// Create state manager
const stateManager = createClientStateManager(lightspeedClient);

// Use with state management
await stateManager.setActiveConversationId('conversation-1');
await stateManager.sendMessage('How do I scale a deployment?');

// Access conversation state
const conversations = stateManager.getConversations();
const messages = stateManager.getMessages('conversation-1');
```

### Using with React State Manager

```typescript
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';

const lightspeedClient = new LightspeedClient({
  baseUrl: process.env.REACT_APP_LIGHTSPEED_URL,
  fetchFunction: (input, init) => fetch(input, init)
});

function App() {
  return (
    <AIStateProvider client={lightspeedClient}>
      <ChatComponent />
    </AIStateProvider>
  );
}

function ChatComponent() {
  const { sendMessage } = useSendMessage();
  const { messages } = useMessages();
  
  const handleSendMessage = async (message: string) => {
    await sendMessage(message);
  };
  
  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.text}</div>
      ))}
      <button onClick={() => handleSendMessage('Hello')}>
        Send Message
      </button>
    </div>
  );
}
```

## Custom Fetch Implementation

### With Authentication

```typescript
const authenticatedFetch: IFetchFunction = async (input, init) => {
  const token = await getAuthToken(); // Your auth logic
  
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      'Authorization': `Bearer ${token}`,
      'X-User-ID': getCurrentUserId()
    }
  });
};

const client = new LightspeedClient({
  baseUrl: 'https://lightspeed-api.openshift.com',
  fetchFunction: authenticatedFetch
});
```

### With Request Logging

```typescript
const loggingFetch: IFetchFunction = async (input, init) => {
  console.log('Making request:', input, init);
  
  const response = await fetch(input, init);
  
  console.log('Response status:', response.status);
  
  return response;
};

const client = new LightspeedClient({
  baseUrl: 'https://lightspeed-api.openshift.com',
  fetchFunction: loggingFetch
});
```

## API Reference

### Core Methods

- `init(): Promise<string>` - Initialize client and get conversation ID
- `sendMessage<TChunk>(conversationId, message, options?): Promise<TChunk | IMessageResponse | void>` - Send message
- `getConversationHistory(conversationId, options?): Promise<IConversationHistoryResponse>` - Get history (stubbed)
- `healthCheck(options?): Promise<HealthCheck>` - Check service health
- `getServiceStatus(options?): Promise<StatusResponse>` - Get service status

### Lightspeed-Specific Methods

- `storeFeedback(feedback, options?): Promise<FeedbackResponse>` - Store user feedback
- `checkAuthorization(userId?, options?): Promise<AuthorizationResponse>` - Check authorization
- `getMetrics(options?): Promise<string>` - Get service metrics

### Types and Interfaces

All types are fully exported and documented with TypeScript. Key interfaces include:

- `LightspeedClientConfig` - Client configuration
- `LLMRequest` / `LLMResponse` - API request/response types
- `MessageChunkResponse` - Streaming chunk format
- `LightspeedClientError` / `LightspeedValidationError` - Error types

## Best Practices

1. **Always use dependency injection** for fetch functions to enable testing
2. **Handle errors appropriately** using the provided error classes
3. **Use streaming for long responses** to improve user experience
4. **Implement custom streaming handlers** for UI integration
5. **Monitor service health** for production deployments
6. **Use state managers** for complex conversation management
7. **Follow workspace patterns** for consistent code organization

## Troubleshooting

### Common Issues

- **Network errors**: Check baseUrl and network connectivity
- **Authentication errors**: Verify fetch function includes proper headers
- **Streaming issues**: Ensure proper Server-Sent Events handling
- **Type errors**: Verify all interfaces are properly imported

For additional support, refer to the workspace documentation and integration tests. 