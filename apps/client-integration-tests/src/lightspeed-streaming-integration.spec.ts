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

import { LightspeedClient, MessageChunkResponse } from '@redhat-cloud-services/lightspeed-client';
import { IStreamingHandler } from '@redhat-cloud-services/ai-client-common';

describe('Lightspeed Client Streaming Integration', () => {
  let client: LightspeedClient;
  const mockServerUrl = 'http://localhost:3002';

  beforeAll(() => {
    client = new LightspeedClient({
      baseUrl: mockServerUrl,
      fetchFunction: (input, init) => fetch(input, init)
    });
  });

  describe('Streaming Messages', () => {
    it('should handle streaming responses from mock server', async () => {
      const conversationId = await client.init();
      const chunks: MessageChunkResponse[] = [];
      let streamCompleted = false;

      // Custom streaming handler to collect chunks
      const testHandler: IStreamingHandler<MessageChunkResponse> = {
        onStart: jest.fn(),
        onChunk: (chunk: MessageChunkResponse) => {
          chunks.push(chunk);
        },
        onComplete: () => {
          streamCompleted = true;
        },
        onError: jest.fn(),
        onAbort: jest.fn(),
      };

      // Override the default handler for this test
      const clientWithTestHandler = new LightspeedClient({
        baseUrl: mockServerUrl,
        fetchFunction: (input, init) => fetch(input, init),
        defaultStreamingHandler: testHandler
      });

      await clientWithTestHandler.sendMessage(
        conversationId,
        'What is OpenShift?',
        { stream: true }
      );

      // Verify streaming completed
      expect(streamCompleted).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify chunks contain expected content
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.finished).toBe(true);
      expect(lastChunk.answer).toContain('OpenShift');
    });

    it('should process afterChunk callback during streaming', async () => {
      const conversationId = await client.init();
      const callbackChunks: MessageChunkResponse[] = [];
      let callbackInvoked = false;

      await client.sendMessage(
        conversationId,
        'Tell me about containers',
        {
          stream: true,
          afterChunk: (chunk: MessageChunkResponse) => {
            callbackInvoked = true;
            callbackChunks.push(chunk);
          }
        }
      );

      expect(callbackInvoked).toBe(true);
      expect(callbackChunks.length).toBeGreaterThan(0);
      
      // Verify final chunk
      const finalChunk = callbackChunks[callbackChunks.length - 1];
      expect(finalChunk.finished).toBe(true);
    }, 10000); // 10 second timeout for streaming test

    it('should handle streaming with custom handler configuration', async () => {
      const conversationId = await client.init();
      let onStartCalled = false;
      let onCompleteCalled = false;
      let onErrorCalled = false;
      const receivedChunks: MessageChunkResponse[] = [];

      const customHandler: IStreamingHandler<MessageChunkResponse> = {
        onStart: () => {
          onStartCalled = true;
        },
        onChunk: (chunk: MessageChunkResponse) => {
          receivedChunks.push(chunk);
        },
        onComplete: () => {
          onCompleteCalled = true;
        },
        onError: () => {
          onErrorCalled = true;
        },
        onAbort: jest.fn(),
      };

      const customClient = new LightspeedClient({
        baseUrl: mockServerUrl,
        fetchFunction: (input, init) => fetch(input, init),
        defaultStreamingHandler: customHandler
      });

      await customClient.sendMessage(
        conversationId,
        'How do I deploy applications?',
        { stream: true }
      );

      expect(onStartCalled).toBe(true);
      expect(onCompleteCalled).toBe(true);
      expect(onErrorCalled).toBe(false);
      expect(receivedChunks.length).toBeGreaterThan(0);

      // Verify content quality
      const allContent = receivedChunks.map(chunk => chunk.answer || '').join('');
      expect(allContent).toContain('OpenShift');
      expect(allContent.length).toBeGreaterThan(50); // Reasonable response length
    }, 10000); // 10 second timeout for streaming test

    it('should handle streaming errors gracefully', async () => {
      // Test with invalid conversation ID to trigger error
      const invalidClient = new LightspeedClient({
        baseUrl: 'http://localhost:9999', // Non-existent server
        fetchFunction: (input, init) => fetch(input, init)
      });

      await expect(
        invalidClient.sendMessage(
          'invalid-id',
          'Test message',
          { stream: true }
        )
      ).rejects.toThrow();
    });

    it('should handle mixed streaming and non-streaming in same conversation', async () => {
      const conversationId = await client.init();

      // Send non-streaming message first
      const nonStreamingResponse = await client.sendMessage(
        conversationId,
        'What is Kubernetes?'
      );

      expect(nonStreamingResponse).toBeDefined();
      expect('answer' in nonStreamingResponse!).toBe(true);

      // Then send streaming message
      const streamingChunks: MessageChunkResponse[] = [];
      const streamingHandler: IStreamingHandler<MessageChunkResponse> = {
        onStart: jest.fn(),
        onChunk: (chunk: MessageChunkResponse) => {
          streamingChunks.push(chunk);
        },
        onComplete: jest.fn(),
        onError: jest.fn(),
        onAbort: jest.fn(),
      };

      const clientWithHandler = new LightspeedClient({
        baseUrl: mockServerUrl,
        fetchFunction: (input, init) => fetch(input, init),
        defaultStreamingHandler: streamingHandler
      });

      await clientWithHandler.sendMessage(
        conversationId,
        'Tell me more about pods',
        { stream: true }
      );

      expect(streamingChunks.length).toBeGreaterThan(0);
      expect(streamingChunks[streamingChunks.length - 1].finished).toBe(true);
    }, 10000);
  });

  describe('Streaming Performance', () => {
    it('should receive streaming chunks within reasonable time', async () => {
      const conversationId = await client.init();
      const chunkTimestamps: number[] = [];
      
      const performanceHandler: IStreamingHandler<MessageChunkResponse> = {
        onStart: () => {
          chunkTimestamps.push(Date.now());
        },
        onChunk: () => {
          chunkTimestamps.push(Date.now());
        },
        onComplete: () => {
          chunkTimestamps.push(Date.now());
        },
        onError: jest.fn(),
        onAbort: jest.fn(),
      };

      const performanceClient = new LightspeedClient({
        baseUrl: mockServerUrl,
        fetchFunction: (input, init) => fetch(input, init),
        defaultStreamingHandler: performanceHandler
      });

      const startTime = Date.now();
      await performanceClient.sendMessage(
        conversationId,
        'Explain deployment strategies',
        { stream: true }
      );
      const endTime = Date.now();

      const totalDuration = endTime - startTime;
      expect(totalDuration).toBeLessThan(10000); // Should complete within 10 seconds

      // Check that chunks arrived at reasonable intervals
      expect(chunkTimestamps.length).toBeGreaterThan(2);
      
      for (let i = 1; i < chunkTimestamps.length; i++) {
        const intervalMs = chunkTimestamps[i] - chunkTimestamps[i - 1];
        expect(intervalMs).toBeLessThan(1000); // No single interval longer than 1 second
      }
    }, 10000);
  });
}); 