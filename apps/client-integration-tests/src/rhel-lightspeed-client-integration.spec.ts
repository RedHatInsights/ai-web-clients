/**
 * RHEL LightSpeed Client Integration Tests
 *
 * Tests the RHEL LightSpeed client against the mock server using TDD approach.
 * These tests verify all endpoints from the OpenAPI specification and ensure
 * proper integration with the ai-client-common interfaces.
 */

import { RHELLightspeedClient } from '@redhat-cloud-services/rhel-lightspeed-client';
import { RHELLightspeedClientConfig } from '@redhat-cloud-services/rhel-lightspeed-client';

describe('RHEL LightSpeed Client Integration Tests', () => {
  const MOCK_SERVER_URL = 'http://localhost:3005/api/lightspeed/v1';
  let client: RHELLightspeedClient;

  beforeEach(() => {
    // Configure the client with native fetch
    const config: RHELLightspeedClientConfig = {
      baseUrl: MOCK_SERVER_URL,
      fetchFunction: fetch,
    };

    client = new RHELLightspeedClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check Endpoint', () => {
    it('should return health status', async () => {
      const healthData = await client.healthCheck();

      expect(healthData).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        version: '0.0.1-mock',
        service: 'RHEL LightSpeed API',
      });
    });
  });

  describe('Hello World Endpoint', () => {
    it('should return hello message', async () => {
      const response = await fetch(`${MOCK_SERVER_URL}/`);
      const data = await response.json();

      expect(data).toEqual({
        message: 'Hello from RHEL LightSpeed API',
        version: '0.0.1',
        description:
          'Answer questions using WatsonX and (optionally) RHEL RAG data',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return metrics data', async () => {
      const response = await fetch(`${MOCK_SERVER_URL}/metrics`);
      const metrics = await response.json();

      expect(metrics).toEqual({
        api_requests_total: expect.any(Number),
        rag_queries_total: expect.any(Number),
        response_time_seconds: expect.any(String),
        active_connections: expect.any(Number),
        cache_hit_ratio: expect.any(String),
      });
    });
  });

  describe('RAG Inference Endpoint', () => {
    it('should send simple question and receive RAG response', async () => {
      const conversationId = 'test-conversation-123';
      const message = 'How do I check memory usage in RHEL?';

      const response = await client.sendMessage(conversationId, message);

      expect(response).toEqual({
        messageId: expect.stringMatching(/^[a-f0-9-]{36}$/),
        answer: expect.stringContaining('RHEL'),
        conversationId,
        date: expect.any(Date),
        additionalAttributes: {
          original_question: message,
          rag_metadata: {
            skip_rag: false,
            sources_consulted: 0,
            knowledge_base_version: 'unknown',
            confidence_score: 1.0,
          },
          context_metadata: null,
          sources: [],
        },
      });
    });

    it('should send message with RHEL context', async () => {
      const conversationId = 'test-conversation-context';
      const message = 'How can I optimize this system?';
      const contextPayload = {
        context: {
          systeminfo: {
            os: 'Red Hat Enterprise Linux',
            version: '9.3',
            arch: 'x86_64',
            id: 'test-system',
          },
          terminal: {
            output: 'Load average: 5.2, Memory usage: 85%',
          },
        },
      };

      const response = await client.sendMessage(conversationId, message, {
        requestPayload: contextPayload,
      });

      expect(response.additionalAttributes?.context_metadata).toEqual({
        has_systeminfo: true,
        has_terminal_output: true,
        has_attachments: false,
        has_stdin: false,
        has_cla_info: false,
      });
    });

    it('should handle skip_rag option', async () => {
      const conversationId = 'test-conversation-skip-rag';
      const message = 'Simple question without RAG';

      const response = await client.sendMessage(conversationId, message, {
        requestPayload: {
          skip_rag: true,
        },
      });

      expect(response.additionalAttributes?.rag_metadata?.skip_rag).toBe(true);
      expect(response.additionalAttributes?.sources).toEqual([]);
    });

    it('should handle validation errors for empty questions', async () => {
      const conversationId = 'test-conversation-validation';

      await expect(client.sendMessage(conversationId, '')).rejects.toThrow();
    });
  });

  describe('Client Interface Compliance', () => {
    it('should implement all required client methods', () => {
      expect(typeof client.init).toBe('function');
      expect(typeof client.sendMessage).toBe('function');
      expect(typeof client.getConversationHistory).toBe('function');
      expect(typeof client.healthCheck).toBe('function');
      expect(typeof client.createNewConversation).toBe('function');
      expect(typeof client.getDefaultStreamingHandler).toBe('function');
    });

    it('should initialize successfully', async () => {
      const initResult = await client.init();

      expect(initResult).toEqual({
        conversations: [],
      });
    });

    it('should create new conversation with UUID', async () => {
      const conversation = await client.createNewConversation();

      expect(conversation).toEqual({
        id: 'rhel-lightspeed-conversation',
        title: 'RHEL LightSpeed Chat',
        locked: false,
        createdAt: expect.any(Date),
      });
    });

    it('should return empty conversation history (RAG system)', async () => {
      const conversationId = 'test-conversation-history';
      const history = await client.getConversationHistory(conversationId);

      expect(history).toEqual([]);
    });

    it('should have no default streaming handler', () => {
      const streamingHandler = client.getDefaultStreamingHandler();
      expect(streamingHandler).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      // Use error injection headers
      const response = await fetch(`${MOCK_SERVER_URL}/infer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mock-error-type': 'server_error',
          'x-mock-error-message': 'Test server error',
        },
        body: JSON.stringify({
          question: 'Test question',
        }),
      });

      expect(response.status).toBe(500);
      const errorData = await response.json();
      expect(errorData.detail[0].msg).toBe('Test server error');
    });

    it('should handle validation errors', async () => {
      const response = await fetch(`${MOCK_SERVER_URL}/infer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mock-error-type': 'validation_error',
          'x-mock-error-message': 'Test validation error',
        },
        body: JSON.stringify({
          question: 'Test question',
        }),
      });

      expect(response.status).toBe(422);
      const errorData = await response.json();
      expect(errorData.detail[0].msg).toBe('Test validation error');
    });
  });
});
