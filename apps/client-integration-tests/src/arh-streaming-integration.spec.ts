/**
 * ARH Client Streaming Integration Tests
 *
 * Tests real streaming functionality using the ARH mock server.
 * This file specifically tests streaming message handling with the
 * @redhat-cloud-services/arh-client and @redhat-cloud-services/ai-client-state packages.
 *
 * Prerequisites: ARH mock server must be running on localhost:3001
 * Start server: npm run arh-mock-server
 */

import { IFDClient } from '@redhat-cloud-services/arh-client';
import type {
  IFDClientConfig,
  IFDAdditionalAttributes,
} from '@redhat-cloud-services/arh-client';
import type { IStreamChunk } from '@redhat-cloud-services/ai-client-common';

import {
  createClientStateManager,
  Events,
} from '@redhat-cloud-services/ai-client-state';

// Custom fetch function that uses the mock server
const createMockServerFetch = (headers?: Record<string, string>) => {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const mergedInit = {
      ...init,
      headers: {
        ...init?.headers,
        ...headers,
      },
    };
    return fetch(url, mergedInit);
  };
};

// Test utilities for collecting streaming data
class TestStreamingCollector {
  public chunks: IStreamChunk<IFDAdditionalAttributes>[] = [];
  public isCompleted = false;
  public errorReceived: Error | null = null;
  public finalMessage = '';

  reset(): void {
    this.chunks = [];
    this.finalMessage = '';
    this.isCompleted = false;
    this.errorReceived = null;
  }

  collectChunk = (chunk: IStreamChunk<IFDAdditionalAttributes>): void => {
    this.chunks.push(chunk);
    this.finalMessage = chunk.answer;
  };

  markCompleted(): void {
    this.isCompleted = true;
  }

  setError(error: Error): void {
    this.errorReceived = error;
  }
}

describe('ARH Client Streaming Integration Tests', () => {
  const mockServerBaseUrl = 'http://localhost:3001';
  let client: IFDClient;
  let streamingCollector: TestStreamingCollector;

  beforeAll(async () => {
    // Verify mock server is running
    try {
      console.log(
        `Testing connection to: ${mockServerBaseUrl}/api/ask/v1/health`
      );
      const healthResponse = await fetch(
        `${mockServerBaseUrl}/api/ask/v1/health`
      );
      console.log(`Health check response status: ${healthResponse.status}`);
      const healthData = await healthResponse.json();
      console.log('Health check data:', healthData);

      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status}`);
      }

      console.log('ARH mock server is healthy and ready for streaming tests');
    } catch (error) {
      console.error('Error connecting to ARH mock server:', error);
      throw new Error(
        'ARH mock server is not running. Start it with: npm run arh-mock-server'
      );
    }
  }, 10000); // Increase timeout to 10 seconds

  beforeEach(() => {
    streamingCollector = new TestStreamingCollector();

    const config: IFDClientConfig = {
      baseUrl: mockServerBaseUrl,
      fetchFunction: createMockServerFetch(),
    };

    client = new IFDClient(config);
  });

  describe('Direct Client Streaming', () => {
    it('should handle streaming messages with handleChunk callback', async () => {
      const conversation = await client.createConversation();
      expect(conversation.conversation_id).toBeDefined();

      streamingCollector.reset();

      const response = await client.sendMessage(
        conversation.conversation_id,
        'Test streaming message',
        {
          stream: true,
          handleChunk: streamingCollector.collectChunk,
        }
      );

      // Verify response exists
      expect(response).toBeDefined();
      expect(response.answer).toBeDefined();

      // Verify chunks were received
      expect(streamingCollector.chunks.length).toBeGreaterThan(0);

      // Verify final message is complete
      expect(streamingCollector.finalMessage.length).toBeGreaterThan(0);

      // Verify final chunk properties
      const finalChunk =
        streamingCollector.chunks[streamingCollector.chunks.length - 1];
      expect(finalChunk.additionalAttributes).toBeDefined();
      if (finalChunk.additionalAttributes?.sources) {
        expect(Array.isArray(finalChunk.additionalAttributes.sources)).toBe(
          true
        );
      }
    });

    it('should provide incremental message content during streaming', async () => {
      const conversation = await client.createConversation();
      const chunks: IStreamChunk<IFDAdditionalAttributes>[] = [];

      await client.sendMessage(
        conversation.conversation_id,
        'Tell me about artificial intelligence and machine learning in detail',
        {
          stream: true,
          handleChunk: (chunk: IStreamChunk<IFDAdditionalAttributes>) => {
            chunks.push(chunk);
          },
        }
      );

      expect(chunks.length).toBeGreaterThan(1);

      // Verify incremental content building
      for (let i = 1; i < chunks.length; i++) {
        const previousLength = chunks[i - 1].answer.length;
        const currentLength = chunks[i].answer.length;
        expect(currentLength).toBeGreaterThanOrEqual(previousLength);
      }
    });

    it('should handle non-streaming and streaming in same conversation', async () => {
      const conversation = await client.createConversation();

      // Send non-streaming message first
      const nonStreamingResponse = await client.sendMessage(
        conversation.conversation_id,
        'Hello'
      );

      expect(nonStreamingResponse.answer).toBeDefined();

      // Then send streaming message
      const streamingChunks: IStreamChunk<IFDAdditionalAttributes>[] = [];

      await client.sendMessage(conversation.conversation_id, 'Tell me more', {
        stream: true,
        handleChunk: (chunk: IStreamChunk<IFDAdditionalAttributes>) => {
          streamingChunks.push(chunk);
        },
      });

      expect(streamingChunks.length).toBeGreaterThan(0);
    });
  });

  describe('State Manager Integration with Streaming', () => {
    it('should handle streaming messages through state manager', async () => {
      const stateManager = createClientStateManager(client);
      let messageUpdateCount = 0;
      let isCompleted = false;

      const unsubscribeMessages = stateManager.subscribe(Events.MESSAGE, () => {
        messageUpdateCount++;
      });

      const unsubscribeInProgress = stateManager.subscribe(
        Events.IN_PROGRESS,
        () => {
          const inProgress = stateManager.getMessageInProgress();
          if (!inProgress && messageUpdateCount > 0) {
            isCompleted = true;
          }
        }
      );

      await stateManager.init();
      await stateManager.createNewConversation();

      await stateManager.sendMessage('Tell me about kubernetes', {
        stream: true,
      });

      // Cleanup
      unsubscribeMessages();
      unsubscribeInProgress();

      expect(isCompleted).toBe(true);
      expect(messageUpdateCount).toBeGreaterThan(0);

      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + Assistant
      expect(messages[1].answer).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle streaming errors gracefully', async () => {
      const invalidClient = new IFDClient({
        baseUrl: 'http://localhost:9999', // Non-existent server
        fetchFunction: createMockServerFetch(),
      });

      await expect(
        invalidClient.sendMessage('invalid-id', 'Test message', {
          stream: true,
          handleChunk: () => {},
        })
      ).rejects.toThrow();
    });
  });
});
