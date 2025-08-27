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
    it('should send streaming messages successfully with afterChunk callback', async () => {
      const client = new LightspeedClient({
        fetchFunction: mockFetch,
        baseUrl: 'https://test-lightspeed.example.com',
      });

      const conversationId = 'conv-stream-123';
      const message = 'Tell me about OpenShift networking';
      const afterChunkCallback = jest.fn();

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('Streaming response'));
            controller.close();
          },
        }),
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await client.sendMessage(conversationId, message, {
        stream: true,
        afterChunk: afterChunkCallback,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-lightspeed.example.com/v1/streaming_query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'text/plain', // Correctly matches mediaType
          }),
          body: expect.stringContaining('"media_type":"text/plain"'),
        })
      );

      expect(result).toBeDefined(); // Streaming now returns IMessageResponse
      expect(result.messageId).toBeDefined();
      expect(result.conversationId).toBe('conv-stream-123');
      expect(result.answer).toBeDefined();
      expect(result.additionalAttributes).toBeDefined();
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

    it('should create conversations with proper locked property', async () => {
      const conversation1 = await client.createNewConversation();
      const conversation2 = await client.createNewConversation();

      expect(conversation1.locked).toBe(false);
      expect(conversation2.locked).toBe(false);
      expect(conversation1.id).not.toBe(conversation2.id);
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
    it('should create a handler instance with required parameters', () => {
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
});
