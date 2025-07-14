/**
 * Example implementations for the IFD Client
 * These demonstrate how to use the client with custom fetch and streaming handlers
 */

import { IFDClient, IFetchFunction, IStreamingHandler, MessageChunkResponse, DefaultStreamingHandler } from './index';

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
 * Example: Simple console logging streaming handler (legacy)
 * Note: Use DefaultStreamingHandler for better functionality
 */
export class ConsoleStreamingHandler implements IStreamingHandler {
  private messageBuffer: string = '';

  onStart(conversationId: string, messageId: string): void {
          console.log(`Stream started for conversation ${conversationId}, message ${messageId}`);
    this.messageBuffer = '';
  }

  onChunk(chunk: MessageChunkResponse): void {
          console.log(`Received chunk:`, chunk.output);
    this.messageBuffer += chunk.output;
  }

      onComplete(finalChunk: MessageChunkResponse): void {
      console.log(`Stream completed. Final message:`, this.messageBuffer);
      console.log(`Sources:`, finalChunk.sources);
    }

      onError(error: Error): void {
      console.error(`Stream error:`, error);
    }

  onAbort(): void {
    console.log(`⏹️ Stream aborted`);
  }

  getCompleteMessage(): string {
    return this.messageBuffer;
  }
}

/**
 * Example: Event-driven streaming handler
 */
export class EventStreamingHandler implements IStreamingHandler {
  private eventTarget = new EventTarget();
  private messageBuffer: string = '';

  onStart(conversationId: string, messageId: string): void {
    this.messageBuffer = '';
    this.eventTarget.dispatchEvent(new CustomEvent('stream:start', {
      detail: { conversationId, messageId }
    }));
  }

  onChunk(chunk: MessageChunkResponse): void {
    this.messageBuffer += chunk.output;
    this.eventTarget.dispatchEvent(new CustomEvent('stream:chunk', {
      detail: { chunk, completeMessage: this.messageBuffer }
    }));
  }

  onComplete(finalChunk: MessageChunkResponse): void {
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
 * Example: Complete usage with all features
 */
export async function exampleUsage() {
  const bearerToken = 'your-jwt-token-here';
  
  // Create client with custom fetch function
  const client = new IFDClient({
    baseUrl: 'https://ifd-001-prod-api.apps.ext-waf.spoke.prod.us-east-1.aws.paas.redhat.com',
    fetchFunction: createAuthenticatedFetch(bearerToken),
  });

  try {
    // Create a new conversation
    const conversation = await client.createConversation();
    console.log('New conversation created:', conversation.conversation_id);

    // Send a non-streaming message
    const response = await client.sendMessage(conversation.conversation_id, {
      input: 'What is Red Hat OpenShift?',
    });
    console.log('Response:', response.output);

    // Send a streaming message using the default handler
    const streamHandler = new DefaultStreamingHandler();
    await client.sendMessageStream(conversation.conversation_id, {
      input: 'Tell me more about OpenShift features',
      stream: true,
    }, {
      streamingHandler: streamHandler,
    });

    // Get conversation history
    const history = await client.getConversationHistory(conversation.conversation_id);
    console.log('Conversation history:', history.messages.length, 'messages');

    // Check quotas
    const quota = await client.getConversationQuota();
    console.log('Conversation quota:', quota);

  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example: React Hook for streaming
 */
export function createReactStreamingHook() {
  return `
// Example React hook (pseudo-code)
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

    try {
      await client.sendMessageStream(conversationId, { input }, { streamingHandler: handler });
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