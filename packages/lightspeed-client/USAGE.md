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
// Initialize client and get conversations
const initResult = await client.init();

// Create a new conversation
const conversation = await client.createNewConversation();
const conversationId = conversation.id;

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
  LightspeedClient
} from '@redhat-cloud-services/lightspeed-client';

const client = new LightspeedClient({
  baseUrl: process.env.LIGHTSPEED_API_URL,
  fetchFunction: (input, init) => fetch(input, init)
});
```

## Streaming Messages

### Basic Streaming

```typescript
import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';
import { LightSpeedCoreAdditionalProperties } from '@redhat-cloud-services/lightspeed-client';

// Enable streaming mode with required handleChunk callback
await client.sendMessage(conversationId, 'Explain OpenShift networking', {
  stream: true,
  handleChunk: (chunk: IStreamChunk<LightSpeedCoreAdditionalProperties>) => {
    console.log('Received chunk:', chunk.answer);
    // Update your UI with the streaming content
  }
});
```

### Custom Streaming Processing

```typescript
import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';
import { LightSpeedCoreAdditionalProperties } from '@redhat-cloud-services/lightspeed-client';

await client.sendMessage(conversationId, 'Tell me about pods', {
  stream: true,
  handleChunk: (chunk: IStreamChunk<LightSpeedCoreAdditionalProperties>) => {
    // Process each chunk as it arrives
    console.log('Answer so far:', chunk.answer);
    console.log('Conversation ID:', chunk.conversationId);
    
    // Access additional attributes like referenced documents
    if (chunk.additionalAttributes?.referencedDocuments) {
      console.log('Referenced docs:', chunk.additionalAttributes.referencedDocuments);
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
import { IFetchFunction } from '@redhat-cloud-services/ai-client-common';

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
import { IFetchFunction } from '@redhat-cloud-services/ai-client-common';

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

- `init(): Promise<{ conversations: IConversation[] }>` - Initialize client and get conversations list
- `createNewConversation(): Promise<IConversation>` - Create a new conversation
- `sendMessage(conversationId, message, options?): Promise<IMessageResponse<LightSpeedCoreAdditionalProperties>>` - Send message
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
- `LightSpeedCoreAdditionalProperties` - Additional metadata in responses
- `LightspeedSendMessageOptions` - Extended send message options with media type support
- `LightspeedClientError` / `LightspeedValidationError` - Error types
- `StreamingEvent` - JSON streaming event types (TokenEvent, StartEvent, EndEvent, etc.)

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