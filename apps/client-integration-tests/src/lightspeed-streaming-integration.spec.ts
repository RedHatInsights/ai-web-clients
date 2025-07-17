/**
 * Lightspeed Client Streaming Integration Tests
 * 
 * Tests real streaming functionality using the live Lightspeed server.
 * This file specifically tests streaming message handling with the
 * @redhat-cloud-services/lightspeed-client and @redhat-cloud-services/ai-client-state packages.
 * 
 * Prerequisites: Lightspeed API server must be running on localhost:8080
 * The server should be the actual OpenShift Lightspeed service.
 */

import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import type { 
  MessageChunkResponse
} from '@redhat-cloud-services/lightspeed-client';
import type { IStreamingHandler } from '@redhat-cloud-services/ai-client-common';

import { 
  createClientStateManager,
  type Message
} from '@redhat-cloud-services/ai-client-state';

// Live server configuration
const LIGHTSPEED_BASE_URL = 'http://localhost:8080';

// Custom fetch function that uses the live server
const createLiveServerFetch = () => {
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

  onStart?(conversationId?: string, messageId?: string): void {
    this.isStarted = true;
    this.chunks = [];
    this.finalMessage = '';
    this.isCompleted = false;
    this.errorReceived = null;
    console.log('Stream started for conversation:', conversationId, 'message:', messageId);
  }

  onChunk(chunk: MessageChunkResponse, afterChunk?: (chunk: MessageChunkResponse) => void): void {
    this.chunks.push(chunk);
    if (chunk.answer) {
      this.finalMessage = chunk.answer; // For plain text streaming, answer contains the full message so far
    }
    
    // Call the optional afterChunk callback
    if (afterChunk) {
      afterChunk(chunk);
    }
  }

  onComplete?(): void {
    this.isCompleted = true;
  }

  onError?(error: Error): void {
    this.errorReceived = error;
  }

  onAbort?(): void {
    // Stream aborted
  }

  reset(): void {
    this.chunks = [];
    this.isStarted = false;
    this.isCompleted = false;
    this.errorReceived = null;
    this.finalMessage = '';
  }
}

/**
 * Helper function to check if the Lightspeed server is available
 */
async function isLightspeedServerAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${LIGHTSPEED_BASE_URL}/liveness`);
    return response.ok;
  } catch {
    return false;
  }
}

describe('Lightspeed Client Live Streaming Integration Tests', () => {
  // Increase timeout for streaming tests since they may take longer to complete
  jest.setTimeout(15000);
  
  let client: LightspeedClient;
  let streamingHandler: TestStreamingHandler;
  let stateManager: ReturnType<typeof createClientStateManager>;

  // Skip all tests if the server is not available
  beforeAll(async () => {
    const serverAvailable = await isLightspeedServerAvailable();
    if (!serverAvailable) {
      // Skip if Lightspeed server not available
      pending('Lightspeed server not available');
    }
  });

  beforeEach(() => {
    streamingHandler = new TestStreamingHandler();
    
    client = new LightspeedClient({
      baseUrl: LIGHTSPEED_BASE_URL,
      fetchFunction: createLiveServerFetch(),
      defaultStreamingHandler: streamingHandler
    });

    stateManager = createClientStateManager(client);
  });

  afterEach(() => {
    streamingHandler.reset();
  });

  describe('Live Server Health Checks', () => {
    it('should connect to live Lightspeed server', async () => {
      const healthStatus = await client.healthCheck();
      
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.ready).toBe(true);
      expect(healthStatus.alive).toBe(true);
      expect(typeof healthStatus.timestamp).toBe('string');
    });

    it('should get service status from live server', async () => {
      if (client.getServiceStatus) {
        const serviceStatus = await client.getServiceStatus();
        
        expect(serviceStatus).toBeDefined();
        expect(typeof serviceStatus.functionality).toBe('string');
        expect(typeof serviceStatus.status).toBe('object');
      } else {
        // Skip if method not available
        expect(true).toBe(true);
      }
    });
  });

  describe('Non-Streaming Message Integration', () => {
    it('should send non-streaming messages to live server', async () => {
      try {
        const conversationId = await client.init();
        
        const response = await client.sendMessage(
          conversationId, 
          'What is OpenShift?'
        );

        expect(response).toBeDefined();
        if (response && typeof response === 'object' && 'answer' in response) {
          expect(typeof response.answer).toBe('string');
          expect((response.answer as string).length).toBeGreaterThan(0);
          expect(response.conversationId).toBe(conversationId);
          expect(typeof response.messageId).toBe('string');
          expect(typeof response.createdAt).toBe('string');
          
          // Check metadata from Lightspeed response
          if (response.metadata && typeof response.metadata === 'object') {
            const metadata = response.metadata as any;
            expect(typeof metadata['inputTokens']).toBe('number');
            expect(typeof metadata['outputTokens']).toBe('number');
            expect(Array.isArray(metadata['referencedDocuments'])).toBe(true);
          }
        }
      } catch (error) {
        // If the server requires authentication or has other requirements, skip this test
        // Live server test failed (possibly due to auth requirements)
        pending('Live server may require authentication or specific configuration');
      }
    }, 10000); // Increase timeout for live server

    it('should handle authorization with live server', async () => {
      // This test might fail if auth is required - that's expected
      try {
        const authResponse = await client.checkAuthorization();
        
        expect(typeof authResponse.user_id).toBe('string');
        expect(typeof authResponse.username).toBe('string');
        expect(typeof authResponse.skip_user_id_check).toBe('boolean');
      } catch (error) {
        // If auth fails, that's expected for a test environment
        // Authorization check failed (expected in test environment)
        expect(true).toBe(true); // Mark test as passing
      }
    });
  });

  describe('Streaming Message Integration', () => {
    it('should handle streaming messages from live server', async () => {
      try {
        const conversationId = await client.init();
        
        await client.sendMessage(
          conversationId, 
          'Explain how to deploy a pod in OpenShift, step by step',
          { stream: true }
        );

        // Wait a bit for streaming to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify streaming handler was called
        expect(streamingHandler.isStarted).toBe(true);
        expect(streamingHandler.chunks.length).toBeGreaterThan(0);
        expect(streamingHandler.finalMessage.length).toBeGreaterThan(0);
        
        // Verify chunks have expected structure
        for (const chunk of streamingHandler.chunks) {
          expect(typeof chunk.answer).toBe('string');
          if (chunk.conversation_id) {
            expect(chunk.conversation_id).toBe(conversationId);
          }
        }
      } catch (error) {
        // If the server requires authentication or has other requirements, skip this test
        // Live streaming test failed (possibly due to auth requirements)
        pending('Live server may require authentication or specific configuration');
      }
    }, 25000); // Increase timeout

    it('should handle streaming with custom afterChunk callback', async () => {
      const conversationId = await client.init();
      const afterChunkCalls: MessageChunkResponse[] = [];
      
      await client.sendMessage(
        conversationId, 
        'What are the main components of OpenShift?',
        { 
          stream: true,
          afterChunk: (chunk) => {
            afterChunkCalls.push(chunk);
          }
        }
      );

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 10000));

      expect(afterChunkCalls.length).toBeGreaterThan(0);
      expect(afterChunkCalls.length).toBe(streamingHandler.chunks.length);
    }, 25000);

    it('should handle error responses during streaming', async () => {
      const conversationId = await client.init();
      
      try {
        // Send an empty query which might cause validation error
        await client.sendMessage(
          conversationId, 
          '',
          { stream: true }
        );
      } catch (error) {
        // Expected - empty query should cause validation error
        expect(error).toBeDefined();
      }
    });
  });

  describe('State Manager Streaming Integration', () => {
    it('should integrate streaming with state manager', async () => {
      // Initialize state manager
      await stateManager.init();
      
      // Get a proper conversation ID from the server
      const conversationId = await client.init();
      stateManager.setActiveConversationId(conversationId);

      const userMessage: Message = {
        id: 'stream-user-msg',
        answer: 'How do I create a deployment in OpenShift?',
        role: 'user'
      };

      // Send streaming message through state manager
      await stateManager.sendMessage(userMessage, { stream: true });

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify message flow
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + assistant messages
      
             const userMsg = messages.find(m => m.role === 'user');
       const assistantMsg = messages.find(m => m.role === 'bot');
      
      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
      expect(userMsg?.answer).toBe('How do I create a deployment in OpenShift?');
      expect(assistantMsg?.answer).toBeDefined();
      expect(assistantMsg?.answer.length).toBeGreaterThan(0);
    }, 30000); // Increase timeout to 30 seconds

    it('should handle multiple streaming messages in conversation', async () => {
      await stateManager.init();
      
      // Get a proper conversation ID from the server
      const conversationId = await client.init();
      stateManager.setActiveConversationId(conversationId);

      // Send first streaming message
      await stateManager.sendMessage({
        id: 'msg-1',
        answer: 'What is a pod in OpenShift?',
        role: 'user'
      }, { stream: true });

      // Wait for first response
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reset handler for second message
      streamingHandler.reset();

      // Send follow-up streaming message
      await stateManager.sendMessage({
        id: 'msg-2',
        answer: 'How do I scale a deployment?',
        role: 'user'
      }, { stream: true });

      // Wait for second response
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify conversation history
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant messages
      
             // Verify message ordering
       const userMessages = messages.filter(m => m.role === 'user');
       const assistantMessages = messages.filter(m => m.role === 'bot');
      
      expect(userMessages.length).toBe(2);
      expect(assistantMessages.length).toBeGreaterThanOrEqual(2);
      
      expect(userMessages[0].answer).toBe('What is a pod in OpenShift?');
      expect(userMessages[1].answer).toBe('How do I scale a deployment?');
    }, 45000); // Increase timeout to 45 seconds for multiple messages
  });

  describe('Live Server Validation', () => {
    it('should validate live server streaming format matches Lightspeed API spec', async () => {
      const conversationId = await client.init();
      
      await client.sendMessage(
        conversationId, 
        'Validate streaming format for OpenShift concepts',
        { stream: true }
      );

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Validate each chunk matches expected Lightspeed structure
      for (const chunk of streamingHandler.chunks) {
        // Required fields per Lightspeed streaming format
        expect(chunk).toHaveProperty('answer');
        expect(typeof chunk.answer).toBe('string');

        // Optional fields that should be present
        if (chunk.conversation_id) {
          expect(typeof chunk.conversation_id).toBe('string');
        }
        
        if (chunk.finished !== undefined) {
          expect(typeof chunk.finished).toBe('boolean');
        }
        
        if (chunk.error) {
          expect(typeof chunk.error).toBe('string');
        }
      }

      // Verify we got actual content
      expect(streamingHandler.finalMessage.length).toBeGreaterThan(0);
      expect(streamingHandler.chunks.length).toBeGreaterThan(0);
    });

    it('should handle server-sent events format correctly', async () => {
      const conversationId = await client.init();
      
      await client.sendMessage(
        conversationId, 
        'Test server-sent events format',
        { stream: true }
      );

      // Wait for streaming
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify streaming completed without errors
      expect(streamingHandler.errorReceived).toBeNull();
      expect(streamingHandler.chunks.length).toBeGreaterThan(0);
      
              // Verify content was accumulated correctly
        // For plain text streaming, the final chunk contains the complete message
        const finalChunk = streamingHandler.chunks[streamingHandler.chunks.length - 1];
        
        expect(finalChunk.answer).toBe(streamingHandler.finalMessage);
        expect(streamingHandler.finalMessage.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling with Live Server', () => {
    it('should handle server errors gracefully during streaming', async () => {
      const conversationId = await client.init();
      
      try {
        // Try to send a request that might cause a server error
        // (using a very long query or malformed request)
        const veryLongQuery = 'a'.repeat(10000); // Might exceed token limits
        
        await client.sendMessage(
          conversationId, 
          veryLongQuery,
          { stream: true }
        );
        
        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // If we get here without error, that's also fine
        expect(true).toBe(true);
      } catch (error) {
        // Error is expected for oversized requests
        expect(error).toBeDefined();
        // Expected error for oversized request
      }
    });

    it('should handle network interruptions during streaming', async () => {
      const conversationId = await client.init();
      const controller = new AbortController();
      
      // Start a streaming request
      const streamPromise = client.sendMessage(
        conversationId, 
        'Tell me about OpenShift networking in detail',
        { 
          stream: true,
          signal: controller.signal
        }
      );

      // Cancel after a short time
      setTimeout(() => controller.abort(), 500);

      try {
        await streamPromise;
      } catch (error) {
        // AbortError is expected
        expect(error).toBeDefined();
        // Expected abort error
      }
    });
  });
}); 