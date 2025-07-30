import { IFDClient, MessageChunkResponse, DefaultStreamingHandler } from './index';
import { IFetchFunction, IStreamingHandler } from '@redhat-cloud-services/ai-client-common';
import * as defaultStreamingHandler from './default-streaming-handler';

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
    (mockFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Resource not found' }),
    });

    await expect(client.createConversation()).rejects.toThrow('API request failed: 404 Not Found');
  });

  it('should construct URLs correctly', async () => {
    (mockFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    await client.getConversationHistory('test-conversation-id');
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-api.example.com/api/ask/v1/conversation/test-conversation-id/history',
      expect.any(Object)
    );
  });

  it('should handle query parameters correctly', async () => {
    (mockFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ([]),
    });

    await client.getUserHistory(25);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-api.example.com/api/ask/v1/user/current/history?limit=25',
      expect.any(Object)
    );
  });

  it('should merge custom headers', async () => {
    (mockFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    });

    await client.healthCheck({
      headers: { 'X-Custom-Header': 'test-value' },
    });
    
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Custom-Header': 'test-value',
        }),
      })
    );
  });

  it('should handle abort signals', async () => {
    const abortController = new AbortController();
    
    (mockFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    });

    await client.healthCheck({
      signal: abortController.signal,
    });
    
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: abortController.signal,
      })
    );
  });

  describe('sendMessage', () => {
    const conversationId = 'test-conversation-id';
    const message = 'Hello, how are you?';

    it('should send non-streaming messages and return IMessageResponse', async () => {
      const mockResponse: MessageChunkResponse = {
        conversation_id: conversationId,
        message_id: 'msg-123',
        answer: 'I am doing well, thank you!',
        received_at: '2024-01-01T00:00:00Z',
        sources: [{ title: 'Test Source', link: 'https://example.com' }],
        tool_call_metadata: { tool_call: false },
        output_guard_result: { answer_relevance: 0.95 }
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
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
        messageId: mockResponse.message_id,
        answer: mockResponse.answer,
        conversationId: mockResponse.conversation_id,
        createdAt: mockResponse.received_at,
        additionalAttributes: {
          sources: mockResponse.sources,
          tool_call_metadata: mockResponse.tool_call_metadata,
          output_guard_result: mockResponse.output_guard_result
        }
      });
    });

    it('should send streaming messages with default handler', async () => {
      const mockHandler: IStreamingHandler<MessageChunkResponse> = {
        onChunk: jest.fn(),
        onStart: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onAbort: jest.fn(),
      };

      // Create client with default streaming handler
      const clientWithHandler = new IFDClient({
        fetchFunction: mockFetch,
        baseUrl: 'https://test-api.example.com',
        defaultStreamingHandler: mockHandler,
      });

      // Mock processStreamWithHandler before making the call
      jest.spyOn(defaultStreamingHandler, 'processStreamWithHandler')
        .mockResolvedValueOnce(undefined);

      // Mock streaming response with a proper body
      const mockResponse = {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          }
        })
      };

      (mockFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await clientWithHandler.sendMessage(conversationId, message, { stream: true });
      
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

      expect(result).toBeUndefined(); // Streaming returns void
    });
  });

  describe('streaming handler management', () => {
    it('should return default streaming handler when configured', () => {
      const mockHandler: IStreamingHandler<MessageChunkResponse> = {
        onChunk: jest.fn(),
        onStart: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onAbort: jest.fn(),
      };

      const clientWithHandler = new IFDClient({
        fetchFunction: mockFetch,
        baseUrl: 'https://test-api.example.com',
        defaultStreamingHandler: mockHandler,
      });

      const result = clientWithHandler.getDefaultStreamingHandler();
      expect(result).toBe(mockHandler);
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
      
      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.title).toBe('New Conversation');
      expect(result.locked).toBe(false);
    });

    it('should set locked status based on is_latest property during init', async () => {
      const mockHealthResponse = { status: 'healthy' };
      const mockStatusResponse = { api: { status: 'operational' } };
      const mockUserSettings = { id: 'user123' };
      const mockHistoryResponse = [
        {
          conversation_id: 'latest-conv',
          title: 'Latest Conversation',
          created_at: '2023-01-01T00:00:00Z',
          is_latest: true
        },
        {
          conversation_id: 'old-conv-1',
          title: 'Old Conversation 1',
          created_at: '2022-12-01T00:00:00Z',
          is_latest: false
        },
        {
          conversation_id: 'old-conv-2',
          title: 'Old Conversation 2',
          created_at: '2022-11-01T00:00:00Z',
          is_latest: false
        }
      ];
      const mockQuota = { limit: 10, used: 3 };

      // Mock all required API calls for init
      (mockFetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => mockHealthResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockStatusResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockUserSettings })
        .mockResolvedValueOnce({ ok: true, json: async () => mockHistoryResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockQuota });

      const result = await client.init();
      
      expect(result.conversations).toHaveLength(3);
      expect(result.initialConversationId).toBe('latest-conv');
      
      // Latest conversation should be unlocked
      const latestConv = result.conversations.find((c: any) => c.id === 'latest-conv');
      expect(latestConv?.locked).toBe(false);
      
      // Old conversations should be locked
      const oldConv1 = result.conversations.find((c: any) => c.id === 'old-conv-1');
      expect(oldConv1?.locked).toBe(true);
      
      const oldConv2 = result.conversations.find((c: any) => c.id === 'old-conv-2');
      expect(oldConv2?.locked).toBe(true);
    });

    it('should handle conversations without is_latest property during init', async () => {
      const mockHealthResponse = { status: 'healthy' };
      const mockStatusResponse = { api: { status: 'operational' } };
      const mockUserSettings = { id: 'user123' };
      const mockHistoryResponse = [
        {
          conversation_id: 'conv-1',
          title: 'Conversation 1',
          created_at: '2023-01-01T00:00:00Z'
          // Missing is_latest property
        }
      ];
      const mockQuota = { limit: 10, used: 1 };
      const mockNewConversation = {
        conversation_id: 'new-conv-created',
        quota: { limit: 10, used: 2 }
      };

      // Mock all required API calls for init - no latest conversation found, so it creates a new one
      (mockFetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => mockHealthResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockStatusResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockUserSettings })
        .mockResolvedValueOnce({ ok: true, json: async () => mockHistoryResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockQuota })
        .mockResolvedValueOnce({ ok: true, json: async () => mockNewConversation });

      const result = await client.init();
      
      expect(result.conversations).toHaveLength(1);
      expect(result.initialConversationId).toBe('new-conv-created');
      expect(result.conversations[0].locked).toBe(true); // Should default to locked when is_latest is missing/undefined
    });
  });
});

describe('DefaultStreamingHandler', () => {
  let handler: DefaultStreamingHandler;

  beforeEach(() => {
    handler = new DefaultStreamingHandler();
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create a handler instance', () => {
    expect(handler).toBeInstanceOf(DefaultStreamingHandler);
  });

  it('should handle streaming lifecycle', () => {
    const handler = new DefaultStreamingHandler();
    const conversationId = 'conv-123';
    const messageId = 'msg-456';
    
    // Start streaming
    handler.onStart(conversationId, messageId);
    expect(handler.getCurrentConversationId()).toBe(conversationId);
    expect(handler.getCurrentMessageId()).toBe(messageId);
    expect(handler.getCompleteMessage()).toStrictEqual({answer: '', sources: []});

    // Process chunks
    const chunk1: MessageChunkResponse = {
      conversation_id: conversationId,
      message_id: messageId,
      answer: 'Hello ',
      received_at: new Date().toISOString(),
      sources: [],
    };

    const chunk2: MessageChunkResponse = {
      conversation_id: conversationId,
      message_id: messageId,
      answer: 'Hello world!',
      received_at: new Date().toISOString(),
      sources: [{ title: 'Test Source', link: 'https://example.com' }],
    };

    handler.onChunk(chunk1);
    expect(handler.getCompleteMessage().answer).toBe('Hello ');

    handler.onChunk(chunk2);
    expect(handler.getCompleteMessage().answer).toBe('Hello world!');

    // Complete streaming
    handler.onComplete(chunk2);
    // Note: onComplete no longer logs to console in current implementation
  });

  it('should handle errors', () => {
    const error = new Error('Test error');
    handler.onError(error);
    
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Stream error'),
      error
    );
  });

  it('should handle abort', () => {
    handler.onAbort();
    
    // Note: onAbort no longer logs to console in current implementation
    expect(handler).toBeDefined();
  });
}); 