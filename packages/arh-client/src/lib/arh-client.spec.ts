import {
  IFDClient,
  MessageChunkResponse,
  DefaultStreamingHandler,
} from './index';
import { IFetchFunction } from '@redhat-cloud-services/ai-client-common';

// Mock fetch function for testing
const mockFetch: IFetchFunction = jest.fn();

describe('IFDClient', () => {
  let client: IFDClient;

  beforeEach(() => {
    client = new IFDClient({
      fetchFunction: mockFetch,
      baseUrl: 'https://test-api.example.com',
    });
    jest.clearAllMocks();
  });

  it('should create a client instance', () => {
    expect(client).toBeInstanceOf(IFDClient);
  });

  it('should handle successful API responses', async () => {
    const mockResponse = {
      conversation_id: '123e4567-e89b-12d3-a456-426614174000',
      quota: { limit: 10, used: 5 },
    };

    (mockFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.createConversation();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-api.example.com/api/ask/v1/conversation',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result).toEqual(mockResponse);
  });

  it('should handle API errors', async () => {
    const errorDetail = [
      {
        loc: ['body', 'message'],
        msg: 'field required',
        type: 'value_error.missing',
      },
    ];

    (mockFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ detail: errorDetail }),
    });

    await expect(client.createConversation()).rejects.toThrow();
  });

  describe('sendMessage', () => {
    it('should send non-streaming messages successfully', async () => {
      const conversationId = 'conv-123';
      const message = 'Hello';

      // Mock message response
      const mockMessageResponse = {
        conversation_id: conversationId,
        message_id: 'test-message-id',
        answer: 'test answer',
        received_at: new Date().toISOString(),
        sources: [],
        tool_call_metadata: null,
        output_guard_result: null,
      };

      // Mock quota response
      const mockQuotaResponse = {
        enabled: true,
        quota: { limit: 10, used: 5 },
      };

      (mockFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMessageResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockQuotaResponse,
        });

      const result = await client.sendMessage(conversationId, message);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.example.com/api/ask/v1/conversation/${conversationId}/message`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"stream":false'),
        })
      );

      expect(result).toEqual({
        messageId: mockMessageResponse.message_id,
        answer: mockMessageResponse.answer,
        conversationId: mockMessageResponse.conversation_id,
        date: expect.any(Date), // Date should be parsed from received_at
        additionalAttributes: {
          sources: mockMessageResponse.sources,
          tool_call_metadata: mockMessageResponse.tool_call_metadata,
          output_guard_result: mockMessageResponse.output_guard_result,
          quota: mockQuotaResponse,
        },
      });
    });

    it('should handle sendMessage with handleChunk callback for non-streaming', async () => {
      const conversationId = 'conv-123';
      const message = 'Hello';
      const mockAfterChunk = jest.fn();

      // Mock non-streaming response
      const mockResponse = {
        conversation_id: conversationId,
        message_id: 'test-message-id',
        answer: 'test answer',
        received_at: new Date().toISOString(),
        sources: [],
        tool_call_metadata: null,
        output_guard_result: null,
      };

      (mockFetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quota: { limit: 10, used: 5 } }),
        });

      const result = await client.sendMessage(conversationId, message, {
        handleChunk: mockAfterChunk,
      });

      expect(result).toBeDefined();
      expect(result.answer).toBe('test answer');
      expect(result.conversationId).toBe(conversationId);
      expect(result.messageId).toBe('test-message-id');

      // handleChunk is not called for non-streaming (state manager handles the response)
      expect(mockAfterChunk).not.toHaveBeenCalled();
    });

    it('should send streaming messages successfully', async () => {
      const conversationId = 'conv-123';
      const message = 'Hello';

      // Mock streaming response with a proper body
      const mockResponse = {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            // Simulate simple streaming response
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  conversation_id: conversationId,
                  message_id: 'test-message-id',
                  answer: 'test answer',
                  received_at: new Date().toISOString(),
                  sources: [],
                  end_of_stream: true,
                })
              )
            );
            controller.close();
          },
        }),
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      // Mock getMessageQuota to return a valid quota response
      const mockQuotaResponse = {
        enabled: true,
        quota: { limit: 10, used: 5 },
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockQuotaResponse,
      });

      const result = await client.sendMessage(conversationId, message, {
        stream: true,
        handleChunk: jest.fn(),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.example.com/api/ask/v1/conversation/${conversationId}/message`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"stream":true'),
        })
      );

      expect(result).toBeDefined(); // Streaming now returns IMessageResponse
      expect(result.messageId).toBeDefined();
      expect(result.conversationId).toBe(conversationId);
      expect(result.answer).toBeDefined();
      expect(result.additionalAttributes).toBeDefined();
    });
  });

  describe('client with clean decoupled interface', () => {
    it('should create client with clean decoupled interface', () => {
      const client = new IFDClient({
        fetchFunction: mockFetch,
        baseUrl: 'https://test-api.example.com',
      });

      // Client should not expose streaming handler methods (decoupled interface)
      expect(client.sendMessage).toBeDefined();
      expect(client.init).toBeDefined();
      expect(client.createNewConversation).toBeDefined();
    });
  });

  describe('Conversation Management', () => {
    it('should create new conversations with locked set to false', async () => {
      const mockResponse = {
        conversation_id: '123e4567-e89b-12d3-a456-426614174000',
        quota: { limit: 10, used: 5 },
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createNewConversation();

      expect(result.id).toBe(mockResponse.conversation_id);
      expect(result.title).toBe('New Conversation');
      expect(result.locked).toBe(false);
    });

    it('should handle init with conversations list', async () => {
      // Mock health check
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      // Mock service status
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'available' }),
      });

      // Mock user settings
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: 'test-user' }),
      });

      // Mock user history
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            conversation_id: 'conv-1',
            title: 'Test Conversation',
            is_latest: true,
            created_at: new Date().toISOString(),
          },
        ],
      });

      // Mock conversation quota
      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          quota: { limit: 10, used: 5 },
        }),
      });

      const result = await client.init();

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toBe('conv-1');
      expect(result.conversations[0].title).toBe('Test Conversation');
      expect(result.conversations[0].locked).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle 422 validation errors', async () => {
      const validationErrors = [
        {
          loc: ['body', 'input'],
          msg: 'field required',
          type: 'value_error.missing',
        },
      ];

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ detail: validationErrors }),
      });

      await expect(client.sendMessage('conv-123', '')).rejects.toThrow(
        'Request validation failed'
      );
    });

    it('should handle network errors', async () => {
      (mockFetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(client.sendMessage('conv-123', 'Hello')).rejects.toThrow(
        'Network error'
      );
    });
  });
});

describe('DefaultStreamingHandler', () => {
  let mockResponse: Response;
  let mockAfterChunk: jest.Mock;
  let mockGetQuota: jest.Mock;

  beforeEach(() => {
    mockAfterChunk = jest.fn();
    mockGetQuota = jest.fn().mockResolvedValue({
      enabled: true,
      quota: { limit: 10, used: 5 },
    });

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
        mockAfterChunk,
        mockGetQuota
      );
      expect(handler).toBeInstanceOf(DefaultStreamingHandler);
    });
  });

  describe('Streaming Lifecycle', () => {
    it('should process chunks with processChunk method', () => {
      const handler = new DefaultStreamingHandler(
        mockResponse,
        'test-conversation',
        mockAfterChunk,
        mockGetQuota
      );

      const chunk: MessageChunkResponse = {
        conversation_id: 'test-conversation',
        message_id: 'test-message',
        answer: 'Hello',
        received_at: new Date().toISOString(),
        sources: [],
        tool_call_metadata: null,
        output_guard_result: null,
      };

      const result = handler.processChunk(chunk, '', mockAfterChunk);

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
        mockAfterChunk,
        mockGetQuota
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
        mockAfterChunk,
        mockGetQuota
      );
      const error = new Error('Test streaming error');

      if (handler.onError) {
        handler.onError(error);
      }

      expect(console.error).toHaveBeenCalledWith('ARH streaming error:', error);
    });
  });
});
