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
  MessageChunkResponse
} from '@redhat-cloud-services/arh-client';
import type { IStreamingHandler } from '@redhat-cloud-services/ai-client-common';

import { 
  createClientStateManager,
  Events,
  UserQuery,
} from '@redhat-cloud-services/ai-client-state';

// Custom fetch function that uses the mock server
const createMockServerFetch = (headers?: Record<string, string>) => {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const mergedInit = {
      ...init,
      headers: {
        ...init?.headers,
        ...headers
      }
    };
    return fetch(url, mergedInit);
  };
};

// Custom streaming handler for testing
class TestStreamingHandler implements IStreamingHandler<MessageChunkResponse> {
  public chunks: MessageChunkResponse[] = [];
  public isStarted = false;
  public isCompleted = false;
  public errorReceived: Error | null = null;
  public finalMessage = '';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onStart?(conversationId?: string, messageId?: string): void {
    this.isStarted = true;
    this.chunks = [];
    this.finalMessage = '';
    this.isCompleted = false;
    this.errorReceived = null;
  }

  onChunk(chunk: MessageChunkResponse, afterChunk?: (chunk: MessageChunkResponse) => void): void {
    afterChunk?.(chunk);
    this.chunks.push(chunk);
    this.finalMessage = chunk.answer;
  }

  onComplete(finalChunk: MessageChunkResponse): void {
    this.isCompleted = true;
    this.chunks.push(finalChunk);
    this.finalMessage = finalChunk.answer;
  }

  onError?(error: Error): void {
    this.errorReceived = error;
  }
}

describe('ARH Client Streaming Integration Tests', () => {
  const mockServerBaseUrl = 'http://localhost:3001';
  let client: IFDClient;
  let streamingHandler: TestStreamingHandler;

  beforeAll(async () => {
    // Verify mock server is running
    try {
      console.log('Testing connection to:', `${mockServerBaseUrl}/api/ask/v1/health`);
      const response = await fetch(`${mockServerBaseUrl}/api/ask/v1/health`);
      console.log('Health check response status:', response.status);
      const healthData = await response.json();
      console.log('Health check data:', healthData);
      
      if (!response.ok) {
        throw new Error(`Mock server health check failed: ${response.status}`);
      }
      console.log('ARH mock server is healthy and ready for tests');
    } catch (error) {
      console.error('Health check failed with error:', error);
      throw new Error(
        'ARH mock server is not running. Start it with: npm run arh-mock-server'
      );
    }
  }, 10000); // Increase timeout to 10 seconds

  beforeEach(() => {
    streamingHandler = new TestStreamingHandler();
    
    const config: IFDClientConfig = {
      baseUrl: mockServerBaseUrl,
      fetchFunction: createMockServerFetch(),
      defaultStreamingHandler: streamingHandler
    };
    
    client = new IFDClient(config);
  });

  describe('Direct Client Streaming', () => {
    it('should handle streaming messages with custom handler', async () => {
      const conversation = await client.createConversation();
      expect(conversation.conversation_id).toBeDefined();

      await client.sendMessage(
        conversation.conversation_id, 
        'Test streaming message',
        { stream: true }
      );

      // Verify streaming started and completed
      expect(streamingHandler.isStarted).toBe(true);
      expect(streamingHandler.isCompleted).toBe(true);
      expect(streamingHandler.errorReceived).toBeNull();

      // Verify chunks were received
      expect(streamingHandler.chunks.length).toBeGreaterThan(0);
      
      // Verify final message is complete
      expect(streamingHandler.finalMessage).toContain('Test streaming message');
      expect(streamingHandler.finalMessage.length).toBeGreaterThan(0);

      // Verify final chunk properties
      const finalChunk = streamingHandler.chunks[streamingHandler.chunks.length - 1];
      expect(finalChunk.sources).toBeDefined();
      expect(Array.isArray(finalChunk.sources)).toBe(true);
    });

    it('should provide incremental message content during streaming', async () => {
      const conversation = await client.createConversation();
      
      await client.sendMessage(
        conversation.conversation_id, 
        'Explain OpenShift features',
        { stream: true }
      );

      // Verify progressive content building
      let previousLength = 0;
      let hasProgression = false;

      for (const chunk of streamingHandler.chunks) {
        expect(chunk.answer.length).toBeGreaterThanOrEqual(previousLength);
        if (chunk.answer.length > previousLength) {
          hasProgression = true;
        }
        previousLength = chunk.answer.length;
      }

      expect(hasProgression).toBe(true);
    });

    it('should include realistic metadata in streaming chunks', async () => {
      const conversation = await client.createConversation();
      
      await client.sendMessage(
        conversation.conversation_id, 
        'What is Red Hat OpenShift?',
        { stream: true }
      );

      // Verify chunk structure
      for (const chunk of streamingHandler.chunks) {
        expect(chunk.message_id).toBeDefined();
        expect(chunk.conversation_id).toBe(conversation.conversation_id);
        expect(chunk.received_at).toBeDefined();
        expect(chunk.tool_call_metadata).toBeDefined();
        expect(chunk.output_guard_result).toBeDefined();
      }

      // Verify final chunk has sources
      const finalChunk = streamingHandler.chunks[streamingHandler.chunks.length - 1];
      expect(finalChunk.sources.length).toBeGreaterThan(0);
      expect(finalChunk.sources[0]).toHaveProperty('title');
      expect(finalChunk.sources[0]).toHaveProperty('link');
    });
  });

  describe('State Manager Streaming Integration', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;

    beforeEach(() => {
      stateManager = createClientStateManager(client);
    });

    it('should handle streaming through state manager', async () => {

      // Create conversation on mock server
      const conversation = await client.createConversation();
      const conversationId = conversation.conversation_id;
      
      // Update conversation ID to match the created one
      await stateManager.setActiveConversationId(conversationId);

      const userMessage: UserQuery = 'Tell me about container orchestration';

      await stateManager.sendMessage(userMessage, { stream: true });

      // Verify streaming completed
      expect(streamingHandler.isStarted).toBe(true);
      expect(streamingHandler.isCompleted).toBe(true);
      expect(streamingHandler.finalMessage).toContain('container orchestration');

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify state was updated correctly
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBe(2); // User message + bot message

      // Verify user message
      expect(messages[0]).toEqual({
        id: expect.any(String),
        answer: 'Tell me about container orchestration',
        role: 'user'
      });

      // Verify bot message contains streaming result
      expect(messages[1].role).toBe('bot');
      expect(messages[1].answer).toBe(streamingHandler.finalMessage);
    }, 10000);

    it('should emit proper events during streaming', async () => {
      const conversation = await client.createConversation();
      await stateManager.setActiveConversationId(conversation.conversation_id);

      const messageCallback = jest.fn();
      const progressCallback = jest.fn();

      stateManager.subscribe(Events.MESSAGE, messageCallback);
      stateManager.subscribe(Events.IN_PROGRESS, progressCallback);

      const userMessage: UserQuery = 'Explain Kubernetes pods';

      await stateManager.sendMessage(userMessage, { stream: true });

      // Verify events were emitted
      // multiple chunks can be emitted, so we check for at least one
      expect(messageCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledTimes(2); // Start and end
    });

    it('should handle streaming errors gracefully', async () => {
      // Use invalid conversation ID to trigger error
      await stateManager.setActiveConversationId('invalid-conversation-id');

      const userMessage: UserQuery = 'This should cause an error';

      await expect(
        stateManager.sendMessage(userMessage, { stream: true })
      ).rejects.toThrow('API request failed: 404 Not Found');
    });
  });

  describe('Streaming Performance and Reliability', () => {
    it('should handle multiple consecutive streaming requests', async () => {
      const conversation = await client.createConversation();
      const requests = [
        'What is OpenShift?',
        'How does Kubernetes work?',
        'Explain container networking'
      ];

      for (const request of requests) {
        // Reset handler for each request
        streamingHandler = new TestStreamingHandler();
        client = new IFDClient({
          baseUrl: mockServerBaseUrl,
          fetchFunction: createMockServerFetch(),
          defaultStreamingHandler: streamingHandler
        });

        await client.sendMessage(conversation.conversation_id, request, { stream: true });

        expect(streamingHandler.isCompleted).toBe(true);
        expect(streamingHandler.finalMessage.toLocaleLowerCase()).toContain(request.toLowerCase().split(' ')[2]);
        expect(streamingHandler.chunks.length).toBeGreaterThan(0);
      }
    // need to bump the timeout as it takes a while to stream the response
    // the response is made artificially slow by the mock server
    }, 10000);

    it('should maintain conversation context across streaming messages', async () => {
      let stateManager = createClientStateManager(client);
      const conversation = await client.createConversation();
      await stateManager.setActiveConversationId(conversation.conversation_id);

      // Send first message
      await stateManager.sendMessage('What is OpenShift?', { stream: true });

      // Send follow-up message
      streamingHandler = new TestStreamingHandler();
      client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch(),
        defaultStreamingHandler: streamingHandler
      });
      stateManager = createClientStateManager(client);
      await stateManager.setActiveConversationId(conversation.conversation_id);

      await stateManager.sendMessage('Tell me more about its features', { stream: true });

      // Verify conversation history is maintained
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBe(4); // 4 because it loads the previous messages from the API if the same conversation is used
      expect(messages[2].answer).toBe('Tell me more about its features');
      expect(messages[3].answer).toBe(streamingHandler.finalMessage);
    }, 10000);
  });

  describe('Streaming Error Handling', () => {
    it('should handle errors that occur during streaming', async () => {
      // Create client with error injection headers
      const errorClient = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-error-after-chunks': '2', // Error after 2 chunks
          'x-mock-error-type': 'stream_error',
          'x-mock-error-message': 'Test streaming error during processing'
        }),
        defaultStreamingHandler: streamingHandler
      });

      const conversation = await errorClient.createConversation();
      
      await errorClient.sendMessage(
        conversation.conversation_id, 
        'This will error during streaming',
        { stream: true }
      );

      // Verify that some chunks were received before the error
      expect(streamingHandler.chunks.length).toBeGreaterThan(0);
      
      // Verify an error was received
      expect(streamingHandler.errorReceived).not.toBeNull();
      expect(streamingHandler.errorReceived?.message).toContain('Test streaming error during processing');
      
      // Verify the error chunk was processed
      const lastChunk = streamingHandler.chunks[streamingHandler.chunks.length - 1];
      expect(lastChunk.answer).toBe('Test streaming error during processing');
      
      // Verify stream completed properly even with error
      expect(streamingHandler.isCompleted).toBe(true);
    });

    it('should handle immediate streaming errors', async () => {
      // Create client with immediate error injection
      const errorClient = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-error-after-chunks': '0', // Error immediately
          'x-mock-error-message': 'Immediate streaming error'
        }),
        defaultStreamingHandler: streamingHandler
      });

      const conversation = await errorClient.createConversation();
      
      await errorClient.sendMessage(
        conversation.conversation_id, 
        'This will error immediately',
        { stream: true }
      );

      // Verify stream started but errored
      expect(streamingHandler.isStarted).toBe(true);
      expect(streamingHandler.errorReceived).not.toBeNull();
      expect(streamingHandler.errorReceived?.message).toContain('Immediate streaming error');
      
      // Verify error chunk was received
      expect(streamingHandler.chunks.length).toBeGreaterThan(0);
      const errorChunk = streamingHandler.chunks[streamingHandler.chunks.length - 1];
      expect(errorChunk.answer).toBe('Immediate streaming error');
      
      expect(streamingHandler.isCompleted).toBe(true);
    });

    it('should handle error state management integration', async () => {
      const errorClient = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-error-after-chunks': '1',
          'x-mock-error-message': 'State manager error test'
        }),
        defaultStreamingHandler: streamingHandler
      });

      const stateManager = createClientStateManager(errorClient);
      const conversation = await errorClient.createConversation();
      await stateManager.setActiveConversationId(conversation.conversation_id);

      const userMessage: UserQuery = 'This will error during streaming through state manager';

      await stateManager.sendMessage(userMessage, { stream: true });

      // Verify error was handled properly
      expect(streamingHandler.errorReceived).not.toBeNull();
      expect(streamingHandler.isCompleted).toBe(true);

      // Verify state manager recorded the error message
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBe(2); // User message + error message
      
      // Verify user message
      expect(messages[0].answer).toBe(userMessage);
      expect(messages[0].role).toBe('user');
      
      // Verify error message was stored
      expect(messages[1].role).toBe('bot');
      expect(messages[1].answer).toBe('State manager error test');
    });

    it('should handle custom error messages during streaming', async () => {
      const customErrorMessage = 'Custom error message for testing error handling';
      
      const errorClient = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-error-after-chunks': '3',
          'x-mock-error-type': 'custom_error',
          'x-mock-error-message': customErrorMessage
        }),
        defaultStreamingHandler: streamingHandler
      });

      const conversation = await errorClient.createConversation();
      
      await errorClient.sendMessage(
        conversation.conversation_id, 
        'Test custom error message',
        { stream: true }
      );

      // Verify custom error message was processed
      expect(streamingHandler.errorReceived).not.toBeNull();
      expect(streamingHandler.errorReceived?.message).toContain(customErrorMessage);
      
      // Verify the error chunk contains the custom message
      const lastChunk = streamingHandler.chunks[streamingHandler.chunks.length - 1];
      expect(lastChunk.answer).toBe(customErrorMessage);
    });

    it('should preserve chunk progression before error occurs', async () => {
      const errorClient = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-error-after-chunks': '4', // Allow several chunks before error
          'x-mock-error-message': 'Error after progression test'
        }),
        defaultStreamingHandler: streamingHandler
      });

      const conversation = await errorClient.createConversation();
      
      await errorClient.sendMessage(
        conversation.conversation_id, 
        'Test progression before error',
        { stream: true }
      );

      // Verify we received multiple chunks before the error
      expect(streamingHandler.chunks.length).toBeGreaterThan(4); // At least 4 content chunks + 1 error chunk
      
      // Separate content chunks from error chunks
      const contentChunks = streamingHandler.chunks.filter(chunk => 
        chunk.answer !== 'Error after progression test'
      );
      const errorChunks = streamingHandler.chunks.filter(chunk => 
        chunk.answer === 'Error after progression test'
      );
      
      // Verify we have both content chunks and error chunks
      expect(contentChunks.length).toBeGreaterThanOrEqual(4);
      expect(errorChunks.length).toBeGreaterThanOrEqual(1);
      
      // Verify progressive content building in content chunks
      let hasProgression = false;
      let previousLength = 0;
      let progressiveChunks = 0;
      
      // Check progression in content chunks (which should be the first several chunks)
      for (let i = 0; i < Math.min(contentChunks.length, 4); i++) {
        const chunk = contentChunks[i];
        
        // Check for progression in content chunks
        if (chunk.answer.length >= previousLength) {
          progressiveChunks++;
          if (chunk.answer.length > previousLength) {
            hasProgression = true;
          }
          previousLength = chunk.answer.length;
        }
      }

      // Verify that we had progression and most chunks were progressive
      expect(hasProgression).toBe(true);
      expect(progressiveChunks).toBeGreaterThanOrEqual(3); // At least 3 chunks should maintain progression
      
      // Verify final chunk is the error
      const lastChunk = streamingHandler.chunks[streamingHandler.chunks.length - 1];
      expect(lastChunk.answer).toBe('Error after progression test');
    });
  });

  describe('Mock Server Validation', () => {
    it('should validate mock server streaming format matches ARH API spec', async () => {
      const conversation = await client.createConversation();
      
      await client.sendMessage(
        conversation.conversation_id, 
        'Validate streaming format',
        { stream: true }
      );

      // Validate each chunk matches expected ARH API structure
      for (const chunk of streamingHandler.chunks) {
        // Required fields per ARH OpenAPI spec
        expect(chunk).toHaveProperty('message_id');
        expect(chunk).toHaveProperty('answer');
        expect(typeof chunk.message_id).toBe('string');
        expect(typeof chunk.answer).toBe('string');

        // Optional fields that should be present in mock
        expect(chunk).toHaveProperty('conversation_id');
        expect(chunk).toHaveProperty('received_at');
        expect(chunk).toHaveProperty('sources');
        expect(chunk).toHaveProperty('tool_call_metadata');
        expect(chunk).toHaveProperty('output_guard_result');

        // Validate types
        expect(Array.isArray(chunk.sources)).toBe(true);
      }
    });
  });
}); 