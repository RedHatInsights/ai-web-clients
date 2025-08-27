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
import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';

describe('Lightspeed Client Streaming Integration', () => {
  let client: LightspeedClient;
  const mockServerUrl = 'http://localhost:3002';

  beforeAll(() => {
    client = new LightspeedClient({
      baseUrl: mockServerUrl,
      fetchFunction: (input, init) => fetch(input, init),
    });
  });

  describe('Streaming Messages', () => {
    it('should handle streaming responses from mock server', async () => {
      const conversationId = crypto.randomUUID(); // Create a new conversation
      const chunks: IStreamChunk<any>[] = [];

      const response = await client.sendMessage(
        conversationId,
        'What is OpenShift?',
        {
          stream: true,
          handleChunk: (chunk: IStreamChunk<any>) => {
            chunks.push(chunk);
          },
        }
      );

      // Verify streaming completed
      expect(chunks.length).toBeGreaterThan(0);
      expect(response.answer).toBeDefined();
      expect(response.conversationId).toBe(conversationId);

      // Verify chunks contain expected content
      if (chunks.length > 0) {
        const allContent = chunks.map((chunk) => chunk.answer).join('');
        expect(allContent.length).toBeGreaterThan(0);
      }
    }, 10000);

    it('should process handleChunk callback during streaming', async () => {
      const conversationId = crypto.randomUUID(); // Create a new conversation
      const callbackChunks: IStreamChunk<any>[] = [];
      let callbackInvoked = false;

      await client.sendMessage(conversationId, 'Tell me about containers', {
        stream: true,
        handleChunk: (chunk: IStreamChunk<any>) => {
          callbackInvoked = true;
          callbackChunks.push(chunk);
        },
      });

      expect(callbackInvoked).toBe(true);
      expect(callbackChunks.length).toBeGreaterThan(0);
    }, 10000); // 10 second timeout for streaming test

    it('should handle streaming with handleChunk callback', async () => {
      const conversationId = crypto.randomUUID(); // Create a new conversation
      let callbackCalled = false;
      let errorOccurred = false;
      const receivedChunks: IStreamChunk<any>[] = [];

      try {
        await client.sendMessage(
          conversationId,
          'How do I deploy applications?',
          {
            stream: true,
            handleChunk: (chunk: IStreamChunk<any>) => {
              callbackCalled = true;
              receivedChunks.push(chunk);
            },
          }
        );
      } catch (error) {
        errorOccurred = true;
      }

      expect(callbackCalled).toBe(true);
      expect(errorOccurred).toBe(false);
      expect(receivedChunks.length).toBeGreaterThan(0);

      // Verify content quality
      const allContent = receivedChunks
        .map((chunk) => chunk.answer || '')
        .join('');
      expect(allContent.length).toBeGreaterThan(0); // Some response received
    }, 10000); // 10 second timeout for streaming test

    it('should handle streaming errors gracefully', async () => {
      // Test with invalid conversation ID to trigger error
      const invalidClient = new LightspeedClient({
        baseUrl: 'http://localhost:9999', // Non-existent server
        fetchFunction: (input, init) => fetch(input, init),
      });

      await expect(
        invalidClient.sendMessage('invalid-id', 'Test message', {
          stream: true,
        })
      ).rejects.toThrow();
    });

    it('should handle mixed streaming and non-streaming in same conversation', async () => {
      const conversationId = crypto.randomUUID(); // Create a new conversation

      // Send non-streaming message first
      const nonStreamingResponse = await client.sendMessage(
        conversationId,
        'What is Kubernetes?'
      );

      expect(nonStreamingResponse).toBeDefined();
      expect(nonStreamingResponse.answer).toBeDefined();

      // Then send streaming message
      const streamingChunks: IStreamChunk<any>[] = [];

      await client.sendMessage(conversationId, 'Tell me more about pods', {
        stream: true,
        handleChunk: (chunk: IStreamChunk<any>) => {
          streamingChunks.push(chunk);
        },
      });

      expect(streamingChunks.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Streaming Performance', () => {
    it('should receive streaming chunks within reasonable time', async () => {
      const conversationId = crypto.randomUUID(); // Create a new conversation
      const chunkTimestamps: number[] = [];

      const startTime = Date.now();
      chunkTimestamps.push(startTime);

      await client.sendMessage(
        conversationId,
        'Explain deployment strategies',
        {
          stream: true,
          handleChunk: () => {
            chunkTimestamps.push(Date.now());
          },
        }
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
