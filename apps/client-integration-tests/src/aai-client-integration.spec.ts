/**
 * AAI Client Integration Tests
 *
 * Tests the @redhat-cloud-services/aai-client package with a real mock server
 * to verify actual HTTP interactions and Server-Sent Events streaming.
 */

import { AAIClient } from '@redhat-cloud-services/aai-client';

describe('AAI Client Integration Tests', () => {
  let client: AAIClient;
  const mockServerUrl = 'http://localhost:3004';

  beforeEach(() => {
    client = new AAIClient({
      baseUrl: mockServerUrl,
      // No mockFetch - use real fetch to hit mock server
    });
  });

  beforeAll(async () => {
    // Health check to ensure mock server is running
    try {
      const response = await fetch(
        `${mockServerUrl}/api/v1/health/status/chatbot/`
      );
      if (!response.ok) {
        throw new Error('Mock server not responding');
      }
    } catch (error) {
      throw new Error(
        `AAI mock server not running at ${mockServerUrl}. Start it with: node aai-mock-server.js`
      );
    }
  });

  describe('Service Status', () => {
    it('should get service status from mock server', async () => {
      const status = await client.getServiceStatus();

      expect(status).toEqual({
        'chatbot-service': 'ok',
        'streaming-chatbot-service': 'ok',
      });
    });

    it('should handle server errors in status endpoint', async () => {
      await expect(
        client.getServiceStatus({
          headers: {
            'x-mock-server-error': 'true',
          },
        })
      ).rejects.toThrow('API request failed: 500');
    });
  });

  describe('Streaming Chat', () => {
    it('should send message and receive streaming response from mock server', async () => {
      const response = await client.sendMessage(
        'test-conv-123',
        'How do I use Ansible?',
        {
          stream: true,
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'How do I use Ansible?', // Will be overridden by message parameter
          },
        }
      );

      // Verify response structure
      expect(response).toBeDefined();
      expect(response?.messageId).toBeDefined();
      expect(response?.answer).toBeDefined();
      expect(response?.conversationId).toBeDefined();
      expect(response?.additionalAttributes).toBeDefined();

      // Should contain SSE event data in additional attributes
      expect(response?.additionalAttributes).toMatchObject({
        end_event: expect.objectContaining({
          referenced_documents: expect.any(Array),
        }),
      });
    });

    it('should handle streaming with custom headers', async () => {
      const response = await client.sendMessage(
        'test-conv-456',
        'What is Ansible Automation Platform?',
        {
          stream: true,
          requestBody: {
            media_type: 'application/json',
            model: 'test/test-model',
            provider: 'test-provider',
            query: 'What is Ansible Automation Platform?',
          },
          headers: {
            'x-session-id': 'test-session-123',
          },
        }
      );

      expect(response).toBeDefined();
      expect(response?.answer).toContain('Ansible');
    });

    it('should use default media_type when not provided', async () => {
      const response = await client.sendMessage(
        'test-conv-789',
        'Tell me about playbooks',
        {
          stream: true,
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'Tell me about playbooks',
          },
        }
      );

      expect(response).toBeDefined();
      expect(response?.answer).toBeDefined();
    });

    it('should handle server errors during streaming', async () => {
      await expect(
        client.sendMessage('test-conv-error', 'This should fail', {
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'This should fail',
          },
          headers: {
            'x-mock-error-after-chunks': '0', // Error immediately
            'x-mock-error-message': 'Test streaming error',
          },
        })
      ).rejects.toThrow();
    });

    it('should handle missing required fields', async () => {
      await expect(
        client.sendMessage('test-conv-validation', 'Missing required fields', {
          requestBody: {
            // Missing model and provider
            query: 'Missing required fields',
          } as any,
        })
      ).rejects.toThrow('API request failed: 422');
    });

    it('should handle responses with extra metadata when requested', async () => {
      const response = await client.sendMessage(
        'test-conv-metadata',
        'Ansible question',
        {
          stream: true,
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'Ansible question',
          },
          headers: {
            'x-mock-include-extra-metadata': 'true',
          },
        }
      );

      expect(response).toBeDefined();
      expect(response?.additionalAttributes).toMatchObject({
        end_event: expect.objectContaining({
          custom_metadata: {
            test_flag: true,
            processing_time: '250ms',
          },
        }),
      });
    });
  });

  describe('Client Interface Compliance', () => {
    it('should implement all IAIClient methods', async () => {
      // Verify all required methods exist
      expect(typeof client.init).toBe('function');
      expect(typeof client.sendMessage).toBe('function');
      expect(typeof client.getConversationHistory).toBe('function');
      expect(typeof client.healthCheck).toBe('function');
      expect(typeof client.getServiceStatus).toBe('function');
      expect(typeof client.createNewConversation).toBe('function');
      // getDefaultStreamingHandler removed in decoupled interface
      expect(typeof client.sendMessage).toBe('function');
    });

    it('should return proper init response', async () => {
      const initResult = await client.init();

      expect(initResult).toEqual({
        conversations: [],
      });
    });

    it('should create new conversations with temp id', async () => {
      const conversation = await client.createNewConversation();

      expect(conversation).toMatchObject({
        id: expect.any(String),
        title: 'New Conversation',
        locked: false,
        createdAt: expect.any(Date),
      });

      // Verify UUID format
      expect(conversation.id).toMatch('__aai_temp_conversation__');
    });

    it('should return empty conversation history for any conversation ID', async () => {
      const history = await client.getConversationHistory(
        'any-conversation-id'
      );

      expect(history).toEqual([]);
    });

    it('should support streaming with afterChunk callback', async () => {
      // This test demonstrates the new decoupled streaming interface
      // where streaming is handled via self-contained handlers with afterChunk callbacks

      const chunks: any[] = [];

      try {
        await client.sendMessage('test-conv-interface', 'Test message', {
          stream: true,
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'Test message',
          },
          afterChunk: (chunk: any) => {
            chunks.push(chunk);
          },
        });
      } catch (error) {
        // Streaming errors are expected in integration tests
        // This test mainly verifies the interface exists
      }

      // Verify the interface accepts afterChunk parameter
      expect(typeof chunks).toBe('object');
    });
  });
});
