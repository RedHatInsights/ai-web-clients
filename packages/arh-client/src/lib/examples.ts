/**
 * Example implementations for the IFD Client
 * These demonstrate how to use the client with custom fetch and streaming handlers
 */

import { IFDClient, MessageChunkResponse, DefaultStreamingHandler } from './index';
import { IFetchFunction, IStreamingHandler } from '@redhat-cloud-services/ai-client-common';

/**
 * Example: Custom fetch function with Bearer token authentication
 */
export function createAuthenticatedFetch(bearerToken: string): IFetchFunction {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = {
      'Authorization': `Bearer ${bearerToken}`,
      ...init?.headers,
    };

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

/**
 * Example: Retry-enabled fetch function
 */
export function createRetryFetch(maxRetries: number = 3, delayMs: number = 1000): IFetchFunction {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fetch(input, init);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
        }
      }
    }
    
    throw lastError!;
  };
}

/**
 * Example: Simple console logging streaming handler
 * Implements the common IStreamingHandler interface
 */
export class ConsoleStreamingHandler implements IStreamingHandler<MessageChunkResponse> {
  private messageBuffer: string = '';

  onStart(conversationId?: string, messageId?: string): void {
    console.log(`Starting stream for conversation ${conversationId}, message ${messageId}`);
    this.messageBuffer = '';
  }

  onChunk(chunk: MessageChunkResponse): void {
    this.messageBuffer = chunk.answer || '';
    console.log('Chunk received:', chunk.answer);
  }

  onComplete(): void {
    console.log('Stream completed. Final message:', this.messageBuffer);
  }

  onError(error: Error): void {
    console.error('Stream error:', error);
  }

  onAbort(): void {
    console.log('Stream aborted');
  }

  getCompleteMessage(): string {
    return this.messageBuffer;
  }
}

/**
 * Example: Event-based streaming handler for React/browser applications
 * Implements the common IStreamingHandler interface
 */
export class EventStreamingHandler implements IStreamingHandler<MessageChunkResponse> {
  private eventTarget = new EventTarget();
  private messageBuffer: string = '';

  onStart(conversationId?: string, messageId?: string): void {
    this.messageBuffer = '';
    this.eventTarget.dispatchEvent(new CustomEvent('stream:start', { 
      detail: { conversationId, messageId } 
    }));
  }

  onChunk(chunk: MessageChunkResponse): void {
    this.messageBuffer = chunk.answer || '';
    this.eventTarget.dispatchEvent(new CustomEvent('stream:chunk', {
      detail: { chunk, completeMessage: this.messageBuffer }
    }));
  }

  onComplete(finalChunk?: MessageChunkResponse): void {
    this.eventTarget.dispatchEvent(new CustomEvent('stream:complete', {
      detail: { finalChunk, completeMessage: this.messageBuffer }
    }));
  }

  onError(error: Error): void {
    this.eventTarget.dispatchEvent(new CustomEvent('stream:error', {
      detail: { error }
    }));
  }

  onAbort(): void {
    this.eventTarget.dispatchEvent(new CustomEvent('stream:abort'));
  }

  addEventListener(type: string, listener: EventListener): void {
    this.eventTarget.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.eventTarget.removeEventListener(type, listener);
  }

  getCompleteMessage(): string {
    return this.messageBuffer;
  }
}

/**
 * Example: Complete usage demonstration of the new unified API
 */
export async function exampleUsage() {
  const bearerToken = 'your-jwt-token-here';
  
  // Example 1: Client with default streaming handler
  const clientWithDefaultHandler = new IFDClient({
    baseUrl: 'https://ifd-001-prod-api.apps.ext-waf.spoke.prod.us-east-1.aws.paas.redhat.com',
    fetchFunction: createAuthenticatedFetch(bearerToken),
    defaultStreamingHandler: new DefaultStreamingHandler(), // Configure default handler
  });

  // Example 2: Client without default streaming handler
  const client = new IFDClient({
    baseUrl: 'https://ifd-001-prod-api.apps.ext-waf.spoke.prod.us-east-1.aws.paas.redhat.com',
    fetchFunction: createAuthenticatedFetch(bearerToken),
  });

  try {
    // Create a new conversation
    const conversation = await client.createConversation();
    console.log('New conversation created:', conversation.conversation_id);

    // Example 3: Send a non-streaming message (returns IMessageResponse)
    const response = await client.sendMessage(
      conversation.conversation_id, 
      'What is Red Hat OpenShift?'
    );
    console.log('Response:', response?.answer);
    console.log('Message ID:', response?.messageId);
    console.log('Metadata:', response?.metadata);

    // Example 4: Send streaming message using client with default handler
    await clientWithDefaultHandler.sendMessage(
      conversation.conversation_id,
      'Tell me more about OpenShift features',
      { stream: true } // Uses the default handler configured in client
    );

    // Example 5: Send streaming message with client that has no default handler
    // This will fail because no handler is configured
    try {
      await client.sendMessage(
        conversation.conversation_id,
        'This will fail - no handler configured',
        { stream: true }
      );
    } catch (error) {
      console.log('Expected error for missing handler:', error);
    }

    // Example 7: Access the default streaming handler for inspection
    const defaultHandler = clientWithDefaultHandler.getDefaultStreamingHandler();
    if (defaultHandler) {
      console.log('Client has a default streaming handler configured');
      // You could inspect or extend it with additional functionality here
    }

    // Example 6: Create a client specifically for a custom handler when needed
    const clientWithCustomHandler = new IFDClient({
      baseUrl: 'https://ifd-001-prod-api.apps.ext-waf.spoke.prod.us-east-1.aws.paas.redhat.com',
      fetchFunction: createAuthenticatedFetch(bearerToken),
      defaultStreamingHandler: new ConsoleStreamingHandler(), // Use custom handler
    });

    await clientWithCustomHandler.sendMessage(
      conversation.conversation_id,
      'What are the benefits of containerization?',
      { stream: true } // Uses the ConsoleStreamingHandler
    );

    // Get conversation history
    const history = await client.getConversationHistory(conversation.conversation_id);
    console.log('Conversation history:', history?.length, 'messages');

    // Check quotas
    const quota = await client.getConversationQuota();
    console.log('Conversation quota:', quota);

  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example: React Hook for streaming using the new unified API
 */
export function createReactStreamingHook() {
  return `
// Example React hook using the new unified sendMessage API
import { useState, useCallback } from 'react';
import { IFDClient, EventStreamingHandler } from '@redhat-cloud-services/arh-client';

export function useIFDStreaming(client: IFDClient) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<Error | null>(null);

  const sendStreamingMessage = useCallback(async (conversationId: string, input: string) => {
    const handler = new EventStreamingHandler();
    
    handler.addEventListener('stream:start', () => {
      setIsStreaming(true);
      setMessage('');
      setError(null);
    });
    
    handler.addEventListener('stream:chunk', (event) => {
      setMessage(event.detail.completeMessage);
    });
    
    handler.addEventListener('stream:complete', () => {
      setIsStreaming(false);
    });
    
    handler.addEventListener('stream:error', (event) => {
      setError(event.detail.error);
      setIsStreaming(false);
    });

    // Create a client with the handler configured as default
    const clientWithHandler = new IFDClient({
      baseUrl: process.env.REACT_APP_IFD_API_URL,
      fetchFunction: createAuthenticatedFetch(process.env.REACT_APP_JWT_TOKEN),
      defaultStreamingHandler: handler
    });

    try {
      await clientWithHandler.sendMessage(conversationId, input, { stream: true });
    } catch (err) {
      setError(err as Error);
      setIsStreaming(false);
    }
  }, []);

  return {
    isStreaming,
    message,
    error,
    sendStreamingMessage,
  };
}

// Alternative: Pre-configure client with default handler
export function useIFDStreamingWithDefault() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<Error | null>(null);

  // Create client with default handler once
  const [client] = useState(() => new IFDClient({
    baseUrl: process.env.REACT_APP_IFD_API_URL,
    fetchFunction: createAuthenticatedFetch(process.env.REACT_APP_JWT_TOKEN),
    defaultStreamingHandler: new EventStreamingHandler()
  }));

  const sendStreamingMessage = useCallback(async (conversationId: string, input: string) => {
    const handler = client.getDefaultStreamingHandler();
    if (handler instanceof EventStreamingHandler) {
      // Setup event listeners for the default handler
      handler.addEventListener('stream:start', () => setIsStreaming(true));
      handler.addEventListener('stream:chunk', (event) => setMessage(event.detail.completeMessage));
      handler.addEventListener('stream:complete', () => setIsStreaming(false));
      handler.addEventListener('stream:error', (event) => setError(event.detail.error));
    }

    try {
      // Use the configured default handler
      await client.sendMessage(conversationId, input, { stream: true });
    } catch (err) {
      setError(err as Error);
      setIsStreaming(false);
    }
  }, [client]);

  return {
    isStreaming,
    message,
    error,
    sendStreamingMessage,
  };
}
`;
} 