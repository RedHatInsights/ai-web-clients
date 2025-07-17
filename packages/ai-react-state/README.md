# @redhat-cloud-services/ai-react-state

React hooks and context provider for AI conversation state management with seamless integration to AI clients.

## Features

- **React Context Provider** - Share AI state across your React component tree
- **Custom Hooks** - Easy-to-use hooks for common AI conversation patterns
- **State Manager Integration** - Built on top of `@redhat-cloud-services/ai-client-state`
- **TypeScript Support** - Fully typed hooks and components for better DX
- **Client Agnostic** - Works with any AI client implementing `IAIClient` interface
- **Event-Driven Updates** - Automatic re-renders when AI state changes

## Installation

```bash
npm install @redhat-cloud-services/ai-react-state
```

**Peer Dependencies:**
- `react >= 16.8.0`

## Quick Start

```tsx
import React from 'react';
import { AIStateProvider, useSendMessage, useMessages, useInProgress } from '@redhat-cloud-services/ai-react-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';

// Create your AI client
const client = new IFDClient({
  baseUrl: 'https://your-api.com',
  fetchFunction: (input, init) => fetch(input, init)
});

function App() {
  return (
    <AIStateProvider client={client}>
      <ChatInterface />
    </AIStateProvider>
  );
}

function ChatInterface() {
  const sendMessage = useSendMessage();
  const messages = useMessages();
  const isInProgress = useInProgress();

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>{message.answer}</div>
      ))}
      
      <button 
        onClick={() => sendMessage('Hello AI!')}
        disabled={isInProgress}
      >
        Send Message
      </button>
    </div>
  );
}
```

## Components

### AIStateProvider

The context provider that makes AI state available to your React component tree.

#### With AI Client

```tsx
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';

const lightspeedClient = new LightspeedClient({
  baseUrl: 'https://lightspeed.openshift.com',
  fetchFunction: authenticatedFetch
});

function App() {
  return (
    <AIStateProvider client={lightspeedClient}>
      <YourChatComponents />
    </AIStateProvider>
  );
}
```

#### With Pre-configured State Manager

```tsx
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

const stateManager = createClientStateManager(client);

function App() {
  return (
    <AIStateProvider stateManager={stateManager}>
      <YourChatComponents />
    </AIStateProvider>
  );
}
```

## Hooks

### useSendMessage

Hook for sending messages to the AI service. Returns the `sendMessage` function directly.

```tsx
import { useSendMessage } from '@redhat-cloud-services/ai-react-state';
import { Message } from '@redhat-cloud-services/ai-client-state';

function ChatInput() {
  const sendMessage = useSendMessage();
  const [input, setInput] = useState('');

  const handleSend = async () => {
    try {
      const message: Message = {
        id: `msg-${Date.now()}`,
        answer: input,
        role: 'user'
      };
      await sendMessage(message);
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div>
      <input 
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
      />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}
```

#### Streaming Messages

```tsx
import { useSendStreamMessage } from '@redhat-cloud-services/ai-react-state';

function StreamingChatInput() {
  const sendStreamMessage = useSendStreamMessage();

  const handleStreamingSend = async (text: string) => {
    const message: Message = {
      id: `msg-${Date.now()}`,
      answer: text,
      role: 'user'
    };
    
    // Automatically streams - no need to set stream: true
    await sendStreamMessage(message);
    // Streaming responses are automatically handled by the state manager
    // UI will update automatically as chunks arrive
  };

  return (
    <button onClick={() => handleStreamingSend('Tell me about OpenShift')}>
      Send Streaming Message
    </button>
  );
}
```

### useSendStreamMessage

Hook that automatically enables streaming for all messages. This is a convenience wrapper around `useSendMessage`.

```tsx
import { useSendStreamMessage } from '@redhat-cloud-services/ai-react-state';
import { Message } from '@redhat-cloud-services/ai-client-state';

function StreamingChatInput() {
  const sendStreamMessage = useSendStreamMessage();
  const [input, setInput] = useState('');

  const handleSend = async () => {
    const message: Message = {
      id: `stream-msg-${Date.now()}`,
      answer: input,
      role: 'user'
    };
    
    // Automatically streams without needing to set stream: true
    await sendStreamMessage(message);
    setInput('');
  };

  return (
    <div>
      <input 
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button onClick={handleSend}>Send Streaming</button>
    </div>
  );
}
```

### useMessages

Hook to access messages from the active conversation.

```tsx
import { useMessages } from '@redhat-cloud-services/ai-react-state';

function MessageList() {
  const messages = useMessages();

  return (
    <div className="message-list">
      {messages.map(message => (
        <div 
          key={message.id} 
          className={`message ${message.role}`}
        >
          <strong>{message.role}:</strong> {message.answer}
        </div>
      ))}
    </div>
  );
}
```

#### With Message Filtering

```tsx
function UserMessages() {
  const allMessages = useMessages();
  const userMessages = allMessages.filter(msg => msg.role === 'user');

  return (
    <div>
      <h3>User Messages ({userMessages.length})</h3>
      {userMessages.map(message => (
        <div key={message.id}>{message.answer}</div>
      ))}
    </div>
  );
}
```

### useActiveConversation

Hook to get the active conversation ID. Returns the conversation ID string or null.

```tsx
import { useActiveConversation } from '@redhat-cloud-services/ai-react-state';
import { useContext } from 'react';
import { AIStateContext } from '@redhat-cloud-services/ai-react-state';

function ConversationManager() {
  const activeConversationId = useActiveConversation();
  const { getState } = useContext(AIStateContext);
  
  const conversations = ['conv-1', 'conv-2', 'conv-3'];

  const setActiveConversation = (convId: string) => {
    // Access state manager directly to set active conversation
    getState().setActiveConversationId(convId);
  };

  return (
    <div>
      <h3>Active: {activeConversationId || 'None'}</h3>
      
      {conversations.map(convId => (
        <button
          key={convId}
          onClick={() => setActiveConversation(convId)}
          disabled={convId === activeConversationId}
        >
          Switch to {convId}
        </button>
      ))}
    </div>
  );
}
```

### useInProgress

Hook to track message sending progress.

```tsx
import { useInProgress } from '@redhat-cloud-services/ai-react-state';

function SendingIndicator() {
  const isInProgress = useInProgress();

  if (!isInProgress) return null;

  return (
    <div className="sending-indicator">
      <span>AI is thinking...</span>
      <div className="spinner" />
    </div>
  );
}
```

#### Disable UI During Progress

```tsx
function ChatControls() {
  const sendMessage = useSendMessage();
  const isInProgress = useInProgress();

  return (
    <div>
      <button 
        onClick={() => sendMessage('Hello')}
        disabled={isInProgress}
      >
        {isInProgress ? 'Sending...' : 'Send Message'}
      </button>
      
      <button disabled={isInProgress}>
        Clear Chat
      </button>
    </div>
  );
}
```

## Complete Example

Here's a comprehensive example showing all hooks working together:

```tsx
import React, { useState } from 'react';
import {
  AIStateProvider,
  useSendMessage,
  useMessages,
  useActiveConversation,
  useInProgress
} from '@redhat-cloud-services/ai-react-state';
import { Message } from '@redhat-cloud-services/ai-client-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';

// Configure your AI client
const client = new IFDClient({
  baseUrl: process.env.REACT_APP_AI_API_URL,
  fetchFunction: (input, init) => fetch(input, init)
});

function App() {
  return (
    <AIStateProvider client={client}>
      <ChatApplication />
    </AIStateProvider>
  );
}

function ChatApplication() {
  return (
    <div className="chat-app">
      <ConversationHeader />
      <MessageDisplay />
      <MessageInput />
      <ProgressIndicator />
    </div>
  );
}

function ConversationHeader() {
  const activeConversationId = useActiveConversation();
  
  return (
    <header>
      <h1>AI Chat</h1>
      <p>Conversation: {activeConversationId}</p>
    </header>
  );
}

function MessageDisplay() {
  const messages = useMessages();

  return (
    <div className="messages">
      {messages.length === 0 ? (
        <p>No messages yet. Start a conversation!</p>
      ) : (
        messages.map(message => (
          <div key={message.id} className={`message ${message.role}`}>
            <strong>{message.role === 'user' ? 'You' : 'AI'}:</strong>
            <span>{message.answer}</span>
          </div>
        ))
      )}
    </div>
  );
}

function MessageInput() {
  const sendMessage = useSendMessage();
  const isInProgress = useInProgress();
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isInProgress) return;

    try {
      const message: Message = {
        id: `msg-${Date.now()}`,
        answer: input,
        role: 'user'
      };
      
      await sendMessage(message, { stream: isStreaming });
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="input-area">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type your message..."
        disabled={isInProgress}
        rows={3}
      />
      
      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={isStreaming}
            onChange={(e) => setIsStreaming(e.target.checked)}
            disabled={isInProgress}
          />
          Streaming Mode
        </label>
        
        <button 
          onClick={handleSend}
          disabled={!input.trim() || isInProgress}
        >
          {isInProgress ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function ProgressIndicator() {
  const isInProgress = useInProgress();

  if (!isInProgress) return null;

  return (
    <div className="progress-indicator">
      <div className="spinner"></div>
      <span>AI is processing your message...</span>
    </div>
  );
}

export default App;
```

## Client Integration Examples

### ARH Client

```tsx
import { IFDClient } from '@redhat-cloud-services/arh-client';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';

const arhClient = new IFDClient({
  baseUrl: 'https://ifd-api.redhat.com',
  fetchFunction: authenticatedFetch
});

<AIStateProvider client={arhClient}>
  <YourApp />
</AIStateProvider>
```

### Lightspeed Client

```tsx
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';

const lightspeedClient = new LightspeedClient({
  baseUrl: 'https://lightspeed.openshift.com',
  fetchFunction: (input, init) => fetch(input, init)
});

<AIStateProvider client={lightspeedClient}>
  <YourApp />
</AIStateProvider>
```

### Multiple Clients

```tsx
import { useState } from 'react';

function MultiClientApp() {
  const [selectedClient, setSelectedClient] = useState<'arh' | 'lightspeed'>('arh');
  
  const arhClient = new IFDClient(arhConfig);
  const lightspeedClient = new LightspeedClient(lightspeedConfig);
  
  const currentClient = selectedClient === 'arh' ? arhClient : lightspeedClient;

  return (
    <div>
      <ClientSelector onSelect={setSelectedClient} />
      
      <AIStateProvider key={selectedClient} client={currentClient}>
        <ChatInterface />
      </AIStateProvider>
    </div>
  );
}
```

## Error Handling

```tsx
import { useSendMessage } from '@redhat-cloud-services/ai-react-state';

function ChatWithErrorHandling() {
  const sendMessage = useSendMessage();
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (text: string) => {
    try {
      setError(null);
      const message: Message = {
        id: `msg-${Date.now()}`,
        answer: text,
        role: 'user'
      };
      await sendMessage(message);
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'An unexpected error occurred';
      setError(errorMessage);
    }
  };

  return (
    <div>
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      {/* Your chat interface */}
    </div>
  );
}
```

## TypeScript Support

All hooks and components are fully typed:

```tsx
import type { Message } from '@redhat-cloud-services/ai-client-state';
import { useMessages } from '@redhat-cloud-services/ai-react-state';

function TypedMessageList() {
  const messages: Message[] = useMessages();
  
  const userMessages = messages.filter(
    (msg): msg is Message & { role: 'user' } => msg.role === 'user'
  );

  return (
    <div>
      {userMessages.map(msg => (
        <div key={msg.id}>{msg.answer}</div>
      ))}
    </div>
  );
}
```

## Compatible Packages

Designed to work with:

- **[@redhat-cloud-services/ai-client-state](../ai-client-state)** - Core state management (required)
- **[@redhat-cloud-services/arh-client](../arh-client)** - Intelligent Front Door (IFD) API client
- **[@redhat-cloud-services/lightspeed-client](../lightspeed-client)** - OpenShift Lightspeed API client
- Any custom client implementing **[@redhat-cloud-services/ai-client-common](../ai-client-common)** interfaces

## Running unit tests

Run `nx test ai-react-state` to execute the unit tests via [Jest](https://jestjs.io).

## Development

This package follows the workspace standards:
- React functional components with hooks
- TypeScript strict mode with full type coverage
- Event-driven updates for optimal performance
- Proper cleanup of subscriptions to prevent memory leaks
