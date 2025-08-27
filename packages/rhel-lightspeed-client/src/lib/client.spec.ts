import { RHELLightspeedClient } from './client';
import { RHELLightspeedClientConfig, RHELLightspeedValidationError, RHELLightspeedServerError } from './types';
import { AIClientError } from '@redhat-cloud-services/ai-client-common';

describe('RHELLightspeedClient', () => {
  let client: RHELLightspeedClient;
  let config: RHELLightspeedClientConfig;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockFetch = jest.fn();
    mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn(),
    };
    
    config = {
      baseUrl: 'https://api.example.com',
      fetchFunction: mockFetch,
    };
    client = new RHELLightspeedClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(RHELLightspeedClient);
    });

    it('should use provided fetch function', () => {
      const customFetch = jest.fn();
      const customConfig = {
        baseUrl: 'https://custom.example.com',
        fetchFunction: customFetch,
      };
      const customClient = new RHELLightspeedClient(customConfig);
      expect(customClient).toBeDefined();
    });

    it('should use native fetch if no fetch function provided', () => {
      const configWithoutFetch = {
        baseUrl: 'https://api.example.com',
      };
      const clientWithoutFetch = new RHELLightspeedClient(configWithoutFetch);
      expect(clientWithoutFetch).toBeDefined();
    });
  });

  describe('init', () => {
    it('should return empty conversations array for RAG system', async () => {
      const result = await client.init();
      expect(result).toEqual({
        conversations: []
      });
    });
  });

  describe('createNewConversation', () => {
    it('should return constant conversation ID for RAG system', async () => {
      const conversation = await client.createNewConversation();
      
      expect(conversation).toEqual({
        id: 'rhel-lightspeed-conversation',
        title: 'RHEL LightSpeed Chat',
        locked: false,
        createdAt: expect.any(Date),
      });
    });

    it('should return the same conversation ID on multiple calls', async () => {
      const conversation1 = await client.createNewConversation();
      const conversation2 = await client.createNewConversation();
      
      expect(conversation1.id).toBe(conversation2.id);
      expect(conversation1.id).toBe('rhel-lightspeed-conversation');
    });
  });

  describe('getConversationHistory', () => {
    it('should return empty array for RAG system', async () => {
      const history = await client.getConversationHistory('any-id');
      expect(history).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should make GET request to /health endpoint', async () => {
      const mockHealthData = { status: 'healthy' };
      (mockResponse.json as jest.Mock).mockResolvedValue(mockHealthData);
      mockFetch.mockResolvedValue(mockResponse as Response);

      const result = await client.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/health', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      expect(result).toEqual(mockHealthData);
    });

    it('should handle health check with custom headers', async () => {
      const mockHealthData = { status: 'healthy' };
      (mockResponse.json as jest.Mock).mockResolvedValue(mockHealthData);
      mockFetch.mockResolvedValue(mockResponse as Response);

      await client.healthCheck({ headers: { 'X-Custom': 'test' } });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/health', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Custom': 'test',
        },
      });
    });
  });

  describe('sendMessage', () => {
    const mockRealServerResponse = {
      data: {
        text: 'This is a RHEL response about your question',
        request_id: '12345-67890',
      }
    };

    beforeEach(() => {
      (mockResponse.json as jest.Mock).mockResolvedValue(mockRealServerResponse);
      mockFetch.mockResolvedValue(mockResponse as Response);
    });

    it('should send message and transform response to IAIClient format', async () => {
      const conversationId = 'test-conversation';
      const message = 'How do I check memory usage?';

      const result = await client.sendMessage(conversationId, message);

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/infer', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: message,
          context: undefined,
          skip_rag: false,
        }),
      });

      expect(result).toEqual({
        messageId: '12345-67890',
        answer: 'This is a RHEL response about your question',
        conversationId,
        date: expect.any(Date),
        additionalAttributes: {
          rag_metadata: {
            skip_rag: false,
            sources_consulted: 0,
            knowledge_base_version: 'unknown',
            confidence_score: 1.0,
          },
          context_metadata: null,
          sources: [],
          original_question: message,
        },
      });
    });

    it('should handle skip_rag option', async () => {
      const conversationId = 'test-conversation';
      const message = 'Simple question';

      await client.sendMessage(conversationId, message, {
        requestPayload: { skip_rag: true }
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/infer', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: message,
          context: undefined,
          skip_rag: true,
        }),
      });
    });

    it('should handle context payload and generate context metadata', async () => {
      const conversationId = 'test-conversation';
      const message = 'How to optimize this system?';
      const contextPayload = {
        context: {
          systeminfo: {
            os: 'Red Hat Enterprise Linux',
            version: '9.3',
            arch: 'x86_64',
          },
          terminal: {
            output: 'Load average: 2.5',
          },
        },
      };

      const result = await client.sendMessage(conversationId, message, {
        requestPayload: contextPayload
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/infer', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: message,
          context: contextPayload.context,
          skip_rag: false,
        }),
      });

      expect(result.additionalAttributes?.context_metadata).toEqual({
        has_systeminfo: true,
        has_terminal_output: true,
        has_attachments: false,
        has_stdin: false,
        has_cla_info: false,
      });
    });

    it('should handle custom headers', async () => {
      const conversationId = 'test-conversation';
      const message = 'Test message';

      await client.sendMessage(conversationId, message, {
        headers: { 'X-Custom': 'test-value' }
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/infer', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Custom': 'test-value',
        },
        body: JSON.stringify({
          question: message,
          context: undefined,
          skip_rag: false,
        }),
      });
    });

    it('should handle signal for request cancellation', async () => {
      const conversationId = 'test-conversation';
      const message = 'Test message';
      const abortController = new AbortController();

      await client.sendMessage(conversationId, message, {
        signal: abortController.signal
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/infer', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: message,
          context: undefined,
          skip_rag: false,
        }),
        signal: abortController.signal,
      });
    });
  });

  describe('error handling', () => {
    it('should throw RHELLightspeedValidationError for 422 responses', async () => {
      const errorResponse = {
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: jest.fn().mockResolvedValue({
          detail: [{ msg: 'Question is required' }]
        }),
      };
      mockFetch.mockResolvedValue(errorResponse as unknown as Response);

      await expect(client.sendMessage('test', 'test')).rejects.toThrow(RHELLightspeedValidationError);
      await expect(client.sendMessage('test', 'test')).rejects.toThrow('Question is required');
    });

    it('should throw RHELLightspeedServerError for 500+ responses', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockResolvedValue({
          detail: [{ msg: 'Server error occurred' }]
        }),
      };
      mockFetch.mockResolvedValue(errorResponse as unknown as Response);

      await expect(client.sendMessage('test', 'test')).rejects.toThrow(RHELLightspeedServerError);
      await expect(client.sendMessage('test', 'test')).rejects.toThrow('Server error occurred');
    });

    it('should throw AIClientError for other HTTP errors', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: jest.fn().mockResolvedValue({
          detail: [{ msg: 'Endpoint not found' }]
        }),
      };
      mockFetch.mockResolvedValue(errorResponse as unknown as Response);

      await expect(client.sendMessage('test', 'test')).rejects.toThrow(AIClientError);
      await expect(client.sendMessage('test', 'test')).rejects.toThrow('Endpoint not found');
    });

    it('should handle JSON parsing errors in error responses', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      mockFetch.mockResolvedValue(errorResponse as unknown as Response);

      await expect(client.sendMessage('test', 'test')).rejects.toThrow(RHELLightspeedServerError);
      await expect(client.sendMessage('test', 'test')).rejects.toThrow('Server error');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.sendMessage('test', 'test')).rejects.toThrow(AIClientError);
      await expect(client.sendMessage('test', 'test')).rejects.toThrow('Network error');
    });

    it('should handle unknown errors', async () => {
      mockFetch.mockRejectedValue('Unknown error');

      await expect(client.sendMessage('test', 'test')).rejects.toThrow(AIClientError);
      await expect(client.sendMessage('test', 'test')).rejects.toThrow('An unknown error occurred');
    });
  });

  describe('RAG system specific behavior', () => {
    it('should use constant conversation ID regardless of input', async () => {
      const conversation = await client.createNewConversation();
      expect(conversation.id).toBe('rhel-lightspeed-conversation');
    });

    it('should always return empty conversation history', async () => {
      const history = await client.getConversationHistory('any-conversation-id');
      expect(history).toEqual([]);
    });

    it('should transform real server response format correctly', async () => {
      const mockServerResponse = {
        data: {
          text: 'RHEL response text',
          request_id: 'req-123',
        }
      };
      (mockResponse.json as jest.Mock).mockResolvedValue(mockServerResponse);
      mockFetch.mockResolvedValue(mockResponse as Response);

      const result = await client.sendMessage('conv-id', 'test question');

      expect(result).toEqual({
        messageId: 'req-123',
        answer: 'RHEL response text',
        conversationId: 'conv-id',
        date: expect.any(Date),
        additionalAttributes: {
          rag_metadata: {
            skip_rag: false,
            sources_consulted: 0,
            knowledge_base_version: 'unknown',
            confidence_score: 1.0,
          },
          context_metadata: null,
          sources: [],
          original_question: 'test question',
        },
      });
    });
  });
});