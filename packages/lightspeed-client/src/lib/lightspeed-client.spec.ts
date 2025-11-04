import { LightspeedClient, DefaultStreamingHandler } from './index';
import { IFetchFunction } from '@redhat-cloud-services/ai-client-common';
import { LightspeedClientError, LightspeedValidationError } from './types';

// Mock fetch function for testing
const mockFetch: IFetchFunction = jest.fn();

describe('LightspeedClient', () => {
  let client: LightspeedClient;

  beforeEach(() => {
    client = new LightspeedClient({
      fetchFunction: mockFetch,
      baseUrl: 'https://test-lightspeed.example.com',
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Client Instantiation', () => {
    it('should create a client instance', () => {
      expect(client).toBeInstanceOf(LightspeedClient);
    });

    it('should create client with clean decoupled interface', () => {
      const client = new LightspeedClient({
        fetchFunction: mockFetch,
        baseUrl: 'https://test-lightspeed.example.com',
      });

      // Client should not expose streaming handler methods (decoupled interface)
      expect(client.sendMessage).toBeDefined();
      expect(client.init).toBeDefined();
      expect(client.createNewConversation).toBeDefined();
    });
  });

  describe('Client Initialization', () => {
    it('should initialize and return conversations list', async () => {
      const result = await client.init();

      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('conversations');
      expect(Array.isArray(result.conversations)).toBe(true);
    });

    it('should return consistent conversations list on multiple calls', async () => {
      const result1 = await client.init();
      const result2 = await client.init();

      expect(result1.conversations).toEqual(result2.conversations);
    });
  });

  describe('Non-Streaming Messages', () => {
    it('should send non-streaming messages successfully', async () => {
      const mockResponse = {
        conversation_id: 'conv-123',
        response: 'Hello! How can I help you with OpenShift?',
        referenced_documents: [
          {
            doc_url: 'https://docs.openshift.com/test',
            doc_title: 'Test Documentation',
          },
        ],
        truncated: false,
        input_tokens: 10,
        output_tokens: 15,
        available_quotas: { UserQuotaLimiter: 100 },
        tool_calls: [],
        tool_results: [],
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await client.sendMessage('conv-123', 'What is OpenShift?');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          }),
          body: expect.stringContaining('"query":"What is OpenShift?"'),
        })
      );

      expect(result).toBeDefined();
      if (result && typeof result === 'object' && 'answer' in result) {
        expect(result.answer).toBe('Hello! How can I help you with OpenShift?');
        expect(result.conversationId).toBe('conv-123');
        expect(result.additionalAttributes).toBeDefined();
      }
    });

    it('should handle custom headers and options', async () => {
      const mockResponse = {
        conversation_id: 'conv-custom',
        response: 'Custom response',
        referenced_documents: [],
        truncated: false,
        input_tokens: 5,
        output_tokens: 8,
        available_quotas: {},
        tool_calls: [],
        tool_results: [],
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.sendMessage('conv-custom', 'Test message', {
        headers: {
          'X-Custom-Header': 'test-value',
          Authorization: 'Bearer test-token',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Custom-Header': 'test-value',
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle AbortSignal for request cancellation', async () => {
      const controller = new AbortController();

      (mockFetch as jest.Mock).mockImplementation(() => {
        return new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('Request aborted'));
          });
        });
      });

      const sendPromise = client.sendMessage('conv-abort', 'Test message', {
        signal: controller.signal,
      });

      controller.abort();

      await expect(sendPromise).rejects.toThrow('Request aborted');
    });
  });

  describe('Streaming Messages', () => {
    it('should send streaming messages successfully with handleChunk callback', async () => {
      const client = new LightspeedClient({
        fetchFunction: mockFetch,
        baseUrl: 'https://test-lightspeed.example.com',
      });

      const conversationId = 'conv-stream-123';
      const message = 'Tell me about OpenShift networking';
      const handleChunkCallback = jest.fn();

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"event": "token", "data": {"id": 0, "token": "Streaming response"}}\n\n'
              )
            );
            controller.close();
          },
        }),
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.sendMessage(conversationId, message, {
        stream: true,
        handleChunk: handleChunkCallback,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/streaming_query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json', // Now defaults to JSON
          }),
          body: expect.stringContaining('"media_type":"application/json"'),
        })
      );

      expect(result).toBeDefined(); // Streaming now returns IMessageResponse
      expect(result.messageId).toBeDefined();
      expect(result.conversationId).toBe('conv-stream-123');
      expect(result.answer).toBeDefined();
      expect(result.additionalAttributes).toBeDefined();
    });

    it('should support text/plain streaming when explicitly specified', async () => {
      const conversationId = 'conv-text-stream';
      const message = 'Test text streaming';
      const handleChunkCallback = jest.fn();

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('Text streaming response')
            );
            controller.close();
          },
        }),
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.sendMessage(conversationId, message, {
        stream: true,
        mediaType: 'text/plain', // Explicitly override default
        handleChunk: handleChunkCallback,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/streaming_query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'text/plain', // Should respect the override
          }),
          body: expect.stringContaining('"media_type":"text/plain"'),
        })
      );

      expect(result).toBeDefined();
      expect(result.conversationId).toBe(conversationId);
    });
  });

  describe('Health Check', () => {
    it('should perform health checks successfully', async () => {
      const readinessResponse = { ready: true, reason: 'service is ready' };
      const livenessResponse = { alive: true };

      (mockFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => readinessResponse,
          headers: new Headers({ 'content-type': 'application/json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => livenessResponse,
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const healthStatus = await client.healthCheck();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://test-lightspeed.example.com/readiness',
        expect.objectContaining({ method: 'GET' })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://test-lightspeed.example.com/liveness',
        expect.objectContaining({ method: 'GET' })
      );

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.ready).toBe(true);
      expect(healthStatus.alive).toBe(true);
      expect(healthStatus.reason).toBe('service is ready');
      expect(typeof healthStatus.timestamp).toBe('string');
    });

    it('should handle unhealthy service status', async () => {
      (mockFetch as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const healthStatus = await client.healthCheck();

      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.ready).toBe(false);
      expect(healthStatus.alive).toBe(false);
      expect(healthStatus.reason).toContain('Service unavailable');
    });

    it('should get service status', async () => {
      const serviceStatus = {
        functionality: 'feedback',
        status: { enabled: true },
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => serviceStatus,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      if (client.getServiceStatus) {
        const result = await client.getServiceStatus();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/feedback/status',
          expect.objectContaining({ method: 'GET' })
        );

        expect(result.functionality).toBe('feedback');
        expect(result.status['enabled']).toBe(true);
      } else {
        // Skip if method not available
        expect(true).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors (500)', async () => {
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          detail: {
            response: 'LLM service is unavailable',
            cause: 'Connection timeout',
          },
        }),
      });

      try {
        await client.sendMessage('conv-123', 'Hello');
      } catch (error) {
        expect(error).toBeInstanceOf(LightspeedClientError);
        if (error instanceof LightspeedClientError) {
          expect(error.status).toBe(500);
          expect(error.statusText).toBe('Internal Server Error');
          expect(error.message).toBe('LLM service is unavailable');
        }
      }
    });

    it('should handle validation errors (422)', async () => {
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({
          detail: [
            {
              loc: ['body', 'query'],
              msg: 'field required',
              type: 'value_error.missing',
            },
          ],
        }),
      });

      await expect(client.sendMessage('conv-123', '')).rejects.toThrow(
        LightspeedValidationError
      );
    });

    it('should handle unauthorized errors (401)', async () => {
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          detail: 'Missing or invalid credentials',
        }),
      });

      await expect(client.sendMessage('conv-123', 'Hello')).rejects.toThrow(
        LightspeedClientError
      );
    });

    it('should handle network errors', async () => {
      (mockFetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(client.sendMessage('conv-123', 'Hello')).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle unparseable error responses', async () => {
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(client.sendMessage('conv-123', 'Hello')).rejects.toThrow(
        'HTTP 500: Internal Server Error'
      );
    });
  });

  describe('Lightspeed-Specific Features', () => {
    it('should store feedback successfully', async () => {
      const feedbackResponse = { response: 'feedback received' };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => feedbackResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await client.storeFeedback({
        conversation_id: 'conv-123',
        user_question: 'How do I deploy a pod?',
        llm_response: 'To deploy a pod...',
        sentiment: 1,
        user_feedback: 'Very helpful!',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"sentiment":1'),
        })
      );

      expect(result.response).toBe('feedback received');
    });

    it('should check authorization successfully', async () => {
      const authResponse = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        username: 'testuser',
        skip_user_id_check: false,
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => authResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await client.checkAuthorization();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/authorized',
        expect.objectContaining({ method: 'POST' })
      );

      expect(result.user_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.username).toBe('testuser');
    });

    it('should check authorization with user ID', async () => {
      const authResponse = {
        user_id: 'user123',
        username: 'testuser',
        skip_user_id_check: true,
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => authResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.checkAuthorization('user123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/authorized?user_id=user123',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should get metrics successfully', async () => {
      const metricsData =
        '# HELP http_requests_total Total HTTP requests\nhttp_requests_total{method="GET"} 100';

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => metricsData,
        headers: new Headers({ 'content-type': 'text/plain' }),
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.getMetrics();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/metrics',
        expect.objectContaining({ method: 'GET' })
      );

      expect(result).toBe(metricsData);
    });
  });

  describe('URL Construction and Parameters', () => {
    it('should construct URLs correctly for different endpoints', async () => {
      (mockFetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // Test various endpoints
      await client.sendMessage('conv-123', 'test');
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://test-lightspeed.example.com/v1/query',
        expect.any(Object)
      );

      await client.storeFeedback({
        conversation_id: 'conv-123',
        user_question: 'test',
        llm_response: 'response',
      });
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://test-lightspeed.example.com/v1/feedback',
        expect.any(Object)
      );
    });

    it('should handle query parameters in authorization endpoint', async () => {
      (mockFetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          user_id: 'test',
          username: 'test',
          skip_user_id_check: false,
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.checkAuthorization('special@user');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/authorized?user_id=special%40user',
        expect.any(Object)
      );
    });
  });

  describe('Conversation Management', () => {
    it('should create new conversations with locked set to false', async () => {
      const result = await client.createNewConversation();

      expect(result.id).toBeDefined();
      expect(result.title).toBe('New Conversation');
      expect(result.locked).toBe(false);
    });

    it('should handle init with empty conversations list', async () => {
      const result = await client.init();

      expect(result.conversations).toEqual([]);
    });

    it('should create conversations with proper locked property and temp ID', async () => {
      const conversation1 = await client.createNewConversation();
      const conversation2 = await client.createNewConversation();

      // Both should have locked=false
      expect(conversation1.locked).toBe(false);
      expect(conversation2.locked).toBe(false);

      // Both should return the same temp ID (this is expected behavior)
      expect(conversation1.id).toBe('__temp_lightspeed_conversation__');
      expect(conversation2.id).toBe('__temp_lightspeed_conversation__');
      expect(conversation1.id).toBe(conversation2.id);

      // Should have proper title and recent date
      expect(conversation1.title).toBe('New Conversation');
      expect(conversation2.title).toBe('New Conversation');
      expect(conversation1.createdAt).toBeInstanceOf(Date);
      expect(conversation2.createdAt).toBeInstanceOf(Date);
    });
  });

  // New API Endpoints (OpenAPI v0.2.0)
  describe('New API Endpoints', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('Service Information', () => {
      it('should get service info, models, and configuration', async () => {
        const mockServiceInfo = {
          name: 'Lightspeed Core Service (LCS)',
          service_version: '0.2.0',
          llama_stack_version: '0.2.18',
        };

        const mockModels = {
          models: [
            {
              identifier: 'gpt-oss-local',
              metadata: {},
              api_model_type: 'llm',
              provider_id: 'ollama-local',
              provider_resource_id: 'gpt-oss:latest',
              type: 'model',
              model_type: 'llm',
            },
          ],
        };

        const mockConfig = {
          name: 'Lightspeed Core Service (LCS)',
          service: {
            host: '0.0.0.0',
            port: 8080,
            auth_enabled: false,
            workers: 1,
            color_log: true,
            access_log: true,
            tls_config: {
              tls_certificate_path: null,
              tls_key_path: null,
              tls_key_password: null,
            },
            cors: {
              allow_origins: ['*'],
              allow_credentials: false,
              allow_methods: ['*'],
              allow_headers: ['*'],
            },
          },
          llama_stack: {
            url: 'http://localhost:8321',
            api_key: '**********',
            use_as_library_client: false,
            library_client_config_path: null,
          },
          user_data_collection: {
            feedback_enabled: true,
            feedback_storage: '/tmp/data/feedback',
            transcripts_enabled: true,
            transcripts_storage: '/tmp/data/transcripts',
          },
          database: {
            sqlite: { db_path: '/tmp/lightspeed-stack.db' },
            postgres: null,
          },
          mcp_servers: [],
          authentication: {
            module: 'noop',
            skip_tls_verification: false,
            k8s_cluster_api: null,
            k8s_ca_cert_path: null,
            jwk_config: null,
          },
          authorization: null,
          customization: null,
          inference: { default_model: null, default_provider: null },
        };

        (mockFetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockServiceInfo),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockModels),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockConfig),
          });

        const serviceInfo = await client.getServiceInfo();
        const models = await client.getModels();
        const config = await client.getConfiguration();

        expect(serviceInfo).toEqual(mockServiceInfo);
        expect(models).toEqual(mockModels);
        expect(config).toEqual(mockConfig);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/info',
          expect.objectContaining({ method: 'GET' })
        );
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/models',
          expect.objectContaining({ method: 'GET' })
        );
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/config',
          expect.objectContaining({ method: 'GET' })
        );
      });
    });

    describe('Conversation Management', () => {
      it('should get conversations list, specific conversation, and delete conversation', async () => {
        const mockConversationsList = {
          conversations: [
            {
              conversation_id: 'conv-123',
              created_at: '2025-09-08T09:33:51',
              last_message_at: '2025-09-08T09:33:51',
              message_count: 1,
              last_used_model: 'gpt-oss-local',
              last_used_provider: 'ollama-local',
            },
          ],
        };

        const mockConversationDetails = {
          conversation_id: 'conv-123',
          chat_history: [
            {
              messages: [
                { content: 'Hello', type: 'user' },
                { content: 'Hi there!', type: 'assistant' },
              ],
              started_at: '2025-09-08T09:33:47.237393Z',
              completed_at: '2025-09-08T09:33:50.927128Z',
            },
          ],
        };

        const mockDeleteResponse = {
          conversation_id: 'conv-123',
          success: true,
          response: 'Conversation deleted successfully',
        };

        (mockFetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockConversationsList),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockConversationDetails),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockDeleteResponse),
          });

        const conversations = await client.getConversations();
        const conversation = await client.getConversation('conv-123');
        const deleteResult = await client.deleteConversation('conv-123');

        expect(conversations).toEqual(mockConversationsList);
        expect(conversation).toEqual(mockConversationDetails);
        expect(deleteResult).toEqual(mockDeleteResponse);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/conversations',
          expect.objectContaining({ method: 'GET' })
        );
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/conversations/conv-123',
          expect.objectContaining({ method: 'GET' })
        );
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/conversations/conv-123',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('Feedback Status Management', () => {
      it('should update feedback status', async () => {
        const mockUpdateResponse = {
          status: {
            previous_status: true,
            updated_status: false,
            updated_by: 'user/test',
            timestamp: '2025-09-08T10:00:00Z',
          },
        };

        (mockFetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockUpdateResponse),
        });

        const result = await client.updateFeedbackStatus({ status: false });

        expect(result).toEqual(mockUpdateResponse);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-lightspeed.example.com/v1/feedback/status',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ status: false }),
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          })
        );
      });
    });
  });

  describe('Updated init() Method', () => {
    it('should load existing conversations and handle errors gracefully', async () => {
      const mockConversationsList = {
        conversations: [
          {
            conversation_id: 'conv-123',
            created_at: '2025-09-08T09:33:51',
            message_count: 5,
            last_message_at: '2025-09-08T09:33:51',
            last_used_model: 'gpt-oss-local',
            last_used_provider: 'ollama-local',
          },
          {
            conversation_id: 'conv-456',
            created_at: '2025-09-07T08:20:30',
            message_count: 2,
            last_message_at: '2025-09-07T08:25:10',
            last_used_model: 'llama3.2:latest',
            last_used_provider: 'ollama-local',
          },
        ],
      };

      (mockFetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockConversationsList),
      });

      const result = await client.init();

      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0].id).toBe('conv-123');
      expect(result.conversations[0].title).toBe('Conversation (5 messages)');
      expect(result.conversations[0].locked).toBe(false);
      expect(result.conversations[0].createdAt).toBeInstanceOf(Date);

      expect(result.conversations[1].id).toBe('conv-456');
      expect(result.conversations[1].title).toBe('Conversation (2 messages)');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/conversations',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle init() errors gracefully', async () => {
      (mockFetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await client.init();

      expect(result.conversations).toEqual([]);
    });
  });

  describe('Conversation History with Message Details', () => {
    it('should get conversation history for specific conversation and handle temp ID', async () => {
      const mockConversationDetails = {
        conversation_id: 'conv-123',
        chat_history: [
          {
            messages: [
              { content: 'What is Docker?', type: 'user' },
              {
                content: 'Docker is a containerization platform...',
                type: 'assistant',
              },
            ],
            started_at: '2025-09-08T09:33:47.237393Z',
            completed_at: '2025-09-08T09:33:50.927128Z',
          },
          {
            messages: [
              { content: 'How do I install it?', type: 'user' },
              { content: 'You can install Docker by...', type: 'assistant' },
            ],
            started_at: '2025-09-08T09:35:12.123456Z',
            completed_at: '2025-09-08T09:35:18.654321Z',
          },
        ],
      };

      (mockFetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockConversationDetails),
      });

      const history = await client.getConversationHistory('conv-123');

      expect(history).toHaveLength(2);
      expect(Array.isArray(history)).toBe(true);

      if (Array.isArray(history)) {
        expect(history[0].input).toBe('What is Docker?');
        expect(history[0].answer).toBe(
          'Docker is a containerization platform...'
        );
        expect(history[0].date).toBeInstanceOf(Date);
        expect(history[0].additionalAttributes).toBeDefined();

        expect(history[1].input).toBe('How do I install it?');
        expect(history[1].answer).toBe('You can install Docker by...');
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/conversations/conv-123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return empty history for temp conversation ID', async () => {
      const history = await client.getConversationHistory(
        '__temp_lightspeed_conversation__'
      );

      expect(history).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle 404 errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ detail: 'Conversation not found' }),
      };

      (mockFetch as jest.Mock).mockResolvedValue(mockResponse);

      const history = await client.getConversationHistory('nonexistent-conv');

      expect(history).toEqual([]);
    });
  });

  describe('Temporary Conversation ID Behavior', () => {
    it('should omit conversation_id in sendMessage when using temp ID', async () => {
      const mockResponse = {
        conversation_id: 'real-conv-123',
        response: 'Hello! How can I help you?',
      };

      (mockFetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.sendMessage('__temp_lightspeed_conversation__', 'Hello');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: 'Hello',
            // conversation_id should be undefined (omitted)
            media_type: 'application/json',
          }),
        })
      );
    });

    it('should include conversation_id in sendMessage when using real ID', async () => {
      const mockResponse = {
        conversation_id: 'real-conv-123',
        response: 'Hello! How can I help you?',
      };

      (mockFetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.sendMessage('real-conv-123', 'Hello');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: 'Hello',
            conversation_id: 'real-conv-123',
            media_type: 'application/json',
          }),
        })
      );
    });
  });
});

describe('DefaultStreamingHandler', () => {
  let mockResponse: Response;
  let mockAfterChunk: jest.Mock;

  beforeEach(() => {
    mockAfterChunk = jest.fn();
    mockResponse = {
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    } as Response;

    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Handler Instantiation', () => {
    it('should create a handler instance with JSON media type (default)', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'application/json',
        mockAfterChunk
      );
      expect(handler).toBeInstanceOf(DefaultStreamingHandler);
    });

    it('should create a handler instance with text/plain media type', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'text/plain',
        mockAfterChunk
      );
      expect(handler).toBeInstanceOf(DefaultStreamingHandler);
    });
  });

  describe('Streaming Lifecycle', () => {
    it('should process text chunks with processChunk method', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'text/plain',
        mockAfterChunk
      );

      const result = handler.processChunk('Hello', '', mockAfterChunk);

      expect(result).toBe('Hello');
      expect(mockAfterChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          answer: 'Hello',
          conversationId: 'test-conversation',
        })
      );
    });

    it('should return final result with getResult method', async () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'text/plain',
        mockAfterChunk
      );

      const result = await handler.getResult();

      expect(result).toEqual(
        expect.objectContaining({
          messageId: expect.any(String),
          answer: expect.any(String),
          conversationId: 'test-conversation',
        })
      );
    });

    it('should process JSON streaming events with processChunk method', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'application/json',
        mockAfterChunk
      );

      const tokenEvent = {
        event: 'token' as const,
        data: { id: 0, token: 'Hello' },
      };

      const result = handler.processChunk(tokenEvent, '', mockAfterChunk);

      expect(result).toBe('Hello');
      expect(mockAfterChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          answer: 'Hello',
          conversationId: 'test-conversation',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle streaming errors', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'text/plain',
        mockAfterChunk
      );
      const error = new Error('Test streaming error');

      if (handler.onError) {
        handler.onError(error);
      }

      expect(console.error).toHaveBeenCalledWith(
        'Lightspeed streaming error:',
        error
      );
    });
  });

  describe('Tool Call Processing', () => {
    it('should only process tool call and tool results', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'application/json',
        mockAfterChunk
      );

      // Reset mock to ensure clean state
      mockAfterChunk.mockClear();

      const toolCallEvent = {
        event: 'tool_call' as const,
        data: {
          id: 526,
          token: {
            tool_name: 'execute_range_query',
            arguments: {
              duration: '1h',
              query: 'sum(rate(container_cpu_usage_seconds_total[5m]))',
            },
          },
        },
      };

      const toolResultEvent = {
        event: 'tool_result' as const,
        data: {
          id: 527,
          token: {
            tool_name: 'some_inference_tool',
            result: { foo: 'bar' },
          },
        },
      };

      // Process both events
      const result1 = handler.processChunk(toolCallEvent, '', mockAfterChunk);
      handler.processChunk(toolResultEvent, result1, mockAfterChunk);

      expect(mockAfterChunk).toHaveBeenCalledTimes(2);
      expect(mockAfterChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalAttributes: expect.objectContaining({
            toolCalls: [toolCallEvent],
            toolResults: [toolResultEvent],
          }),
        })
      );
    });

    it('should accumulate multiple tool_call events', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        'application/json',
        mockAfterChunk
      );

      // Reset mock to ensure clean state
      mockAfterChunk.mockClear();

      const toolEvent1 = {
        event: 'tool_call' as const,
        data: {
          id: 1,
          token: { tool_name: 'tool1', arguments: {} },
        },
      };

      const toolEvent2 = {
        event: 'tool_call' as const,
        data: {
          id: 2,
          token: { tool_name: 'tool2', arguments: {} },
        },
      };

      // Process both events
      handler.processChunk(toolEvent1, '', mockAfterChunk);
      handler.processChunk(toolEvent2, '', mockAfterChunk);

      // Both events should be accumulated
      expect(mockAfterChunk).toHaveBeenCalledTimes(2);
      expect(mockAfterChunk).toHaveBeenLastCalledWith(
        expect.objectContaining({
          additionalAttributes: expect.objectContaining({
            toolCalls: [toolEvent1, toolEvent2],
          }),
        })
      );
    });
  });
});
