import { IFDClient, IFetchFunction, MessageChunkResponse, DefaultStreamingHandler } from './index';

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
    const conversationId = 'conv-123';
    const messageId = 'msg-456';
    
    // Start streaming
    handler.onStart(conversationId, messageId);
    expect(handler.getCurrentConversationId()).toBe(conversationId);
    expect(handler.getCurrentMessageId()).toBe(messageId);
    expect(handler.getCompleteMessage()).toBe('');

    // Process chunks
    const chunk1: MessageChunkResponse = {
      conversation_id: conversationId,
      message_id: messageId,
      output: 'Hello ',
      received_at: new Date().toISOString(),
      sources: [],
    };

    const chunk2: MessageChunkResponse = {
      conversation_id: conversationId,
      message_id: messageId,
      output: 'Hello world!',
      received_at: new Date().toISOString(),
      sources: [{ title: 'Test Source', link: 'https://example.com' }],
    };

    handler.onChunk(chunk1);
    expect(handler.getCompleteMessage()).toBe('Hello ');

    handler.onChunk(chunk2);
    expect(handler.getCompleteMessage()).toBe('Hello world!');

    // Complete streaming
    handler.onComplete(chunk2);
    expect(console.log).toHaveBeenCalledWith(
              expect.stringContaining('Stream completed. Final message:'),
      'Hello world!'
    );
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
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Stream aborted')
    );
  });
}); 