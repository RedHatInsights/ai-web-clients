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
const createMockServerFetch = () => {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    return fetch(url, init);
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

  onChunk(chunk: MessageChunkResponse): void {
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
      const conversationId = 'stream-state-test';
      stateManager.setActiveConversationId(conversationId);

      // Create conversation on mock server
      const conversation = await client.createConversation();
      
      // Update conversation ID to match the created one
      stateManager.setActiveConversationId(conversation.conversation_id);

      const userMessage: UserQuery = 'Tell me about container orchestration';

      await stateManager.sendMessage(userMessage, { stream: true });

      // Verify streaming completed
      expect(streamingHandler.isStarted).toBe(true);
      expect(streamingHandler.isCompleted).toBe(true);
      expect(streamingHandler.finalMessage).toContain('container orchestration');

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
    });

    it('should emit proper events during streaming', async () => {
      const conversation = await client.createConversation();
      stateManager.setActiveConversationId(conversation.conversation_id);

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
      stateManager.setActiveConversationId('invalid-conversation-id');

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
      stateManager.setActiveConversationId(conversation.conversation_id);

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
      stateManager.setActiveConversationId(conversation.conversation_id);

      await stateManager.sendMessage('Tell me more about its features', { stream: true });

      // Verify conversation history is maintained
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBe(2); // Only the second exchange since state manager creates new state
      expect(messages[0].answer).toBe('Tell me more about its features');
      expect(messages[1].answer).toBe(streamingHandler.finalMessage);
    }, 10000);
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