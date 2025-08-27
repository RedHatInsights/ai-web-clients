/**
 * Example implementations for the IFD Client
 * These demonstrate how to use the client with custom fetch and streaming handlers
 */

import { IFDClient } from './index';
import {
  IFetchFunction,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';
import type { IFDAdditionalAttributes } from './types';

/**
 * Example: Custom fetch function with Bearer token authentication
 */
export function createAuthenticatedFetch(bearerToken: string): IFetchFunction {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = {
      Authorization: `Bearer ${bearerToken}`,
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
export function createRetryFetch(
  maxRetries: number = 3,
  delayMs: number = 1000
): IFetchFunction {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fetch(input, init);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, delayMs * Math.pow(2, attempt))
          );
        }
      }
    }

    throw lastError!;
  };
}

/**
 * Example: Simple console logging for streaming chunks
 * Uses the new decoupled afterChunk callback pattern
 */
export function createConsoleChunkHandler() {
  let messageBuffer = '';

  return (chunk: IStreamChunk<IFDAdditionalAttributes>) => {
    messageBuffer = chunk.answer || '';
    console.log('Chunk received:', chunk.answer);
    console.log('Complete message so far:', messageBuffer);
  };
}

/**
 * Example: Event-based streaming for React/browser applications
 * Uses the new decoupled afterChunk callback pattern with EventTarget
 */
export function createEventChunkHandler() {
  const eventTarget = new EventTarget();
  let messageBuffer = '';

  const chunkHandler = (chunk: IStreamChunk<IFDAdditionalAttributes>) => {
    messageBuffer = chunk.answer || '';
    eventTarget.dispatchEvent(
      new CustomEvent('stream:chunk', {
        detail: { chunk, completeMessage: messageBuffer },
      })
    );
  };

  return {
    chunkHandler,
    addEventListener: (type: string, listener: EventListener) => {
      eventTarget.addEventListener(type, listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      eventTarget.removeEventListener(type, listener);
    },
    getCompleteMessage: () => messageBuffer,
  };
}

/**
 * Example: Complete usage demonstration of the new decoupled API
 */
export async function exampleUsage() {
  const bearerToken = 'your-jwt-token-here';

  // Create client with the new decoupled interface
  const client = new IFDClient({
    baseUrl: 'https://your-ifd-api.com',
    fetchFunction: createAuthenticatedFetch(bearerToken),
  });

  try {
    // Create a new conversation
    const conversation = await client.createConversation();
    console.log('New conversation created:', conversation.conversation_id);

    // Example 1: Send a non-streaming message (returns IMessageResponse)
    const response = await client.sendMessage(
      conversation.conversation_id,
      'What is Red Hat OpenShift?'
    );
    console.log('Response:', response?.answer);
    console.log('Message ID:', response?.messageId);
    console.log('Additional attributes:', response?.additionalAttributes);

    // Example 2: Send streaming message with console logging
    const consoleHandler = createConsoleChunkHandler();
    await client.sendMessage(
      conversation.conversation_id,
      'Tell me more about OpenShift features',
      {
        stream: true,
        afterChunk: consoleHandler,
      }
    );

    // Example 3: Send streaming message with event-based handling
    const eventHandler = createEventChunkHandler();

    // Set up event listeners
    eventHandler.addEventListener('stream:chunk', (event: any) => {
      console.log('Event received:', event.detail.completeMessage);
    });

    await client.sendMessage(
      conversation.conversation_id,
      'What are the benefits of containerization?',
      {
        stream: true,
        afterChunk: eventHandler.chunkHandler,
      }
    );

    console.log('Final message:', eventHandler.getCompleteMessage());

    // Example 4: Inline afterChunk callback
    await client.sendMessage(
      conversation.conversation_id,
      'How does OpenShift handle security?',
      {
        stream: true,
        afterChunk: (chunk: IStreamChunk<IFDAdditionalAttributes>) => {
          console.log('Inline handler - chunk:', chunk.answer);
          console.log(
            'Chunk additional attributes:',
            chunk.additionalAttributes
          );
        },
      }
    );

    // Get conversation history
    const history = await client.getConversationHistory(
      conversation.conversation_id
    );
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
