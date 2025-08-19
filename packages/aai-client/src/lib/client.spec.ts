import { AAIClient } from './client';

describe('AAIClient', () => {
  let client: AAIClient;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = jest.fn();
    client = new AAIClient({
      baseUrl: 'https://api.test.com',
      fetchFunction: mockFetch
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create client instance', () => {
    expect(client).toBeDefined();
  });

  it('should return health check status', async () => {
    const result = await client.healthCheck();
    expect(result).toEqual({ status: 'ok' });
  });

  it('should get service status from API', async () => {
    const mockResponse = {
      'chatbot-service': 'ok',
      'streaming-chatbot-service': 'ok'
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await client.getServiceStatus();
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/health/status/chatbot/',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    expect(result).toEqual(mockResponse);
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(client.getServiceStatus()).rejects.toThrow(
      'API request failed: 500 Internal Server Error'
    );
  });

  it('should send message to streaming endpoint', async () => {
    // Create a mock ReadableStream for SSE data
    const mockSSEData = 'data: {"event": "token", "data": {"id": 1, "role": "inference", "token": "Hello"}}\n\ndata: {"event": "end", "data": {}}\n\n';
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(mockSSEData));
        controller.close();
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: mockStream,
    } as Response);

    const result = await client.sendMessage('test-conv-123', 'Hello test message', {
      stream: true,
      requestBody: {
        model: "test/test-model",
        provider: "test-provider",
        query: "Hello test message", // This will be overridden by the message parameter
      }
    });
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/ai/streaming_chat/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_type: "application/json",
          model: "test/test-model",
          provider: "test-provider",
          query: "Hello test message",
          conversation_id: "test-conv-123",
        }),
      }
    );
    expect(result).toBeDefined();
    expect(result.answer).toBe('Hello');
  });

  it('should require requestBody in options', async () => {
    await expect(client.sendMessage('test-conv', 'Hello')).rejects.toThrow(
      'requestBody is required in options'
    );
  });

  it('should use default media_type when not provided', async () => {
    // Create a mock ReadableStream for SSE data
    const mockSSEData = 'data: {"event": "token", "data": {"id": 1, "role": "inference", "token": "Test"}}\n\ndata: {"event": "end", "data": {}}\n\n';
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(mockSSEData));
        controller.close();
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: mockStream,
    } as Response);

    await client.sendMessage('test-conv', 'Hello test', {
      stream: true,
      requestBody: {
        model: "test/test-model",
        provider: "test-provider",
        query: "Hello test",
      }
    });
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/ai/streaming_chat/',
      expect.objectContaining({
        body: JSON.stringify({
          media_type: "application/json", // Should use default
          model: "test/test-model",
          provider: "test-provider",
          query: "Hello test",
          conversation_id: "test-conv",
        }),
      })
    );
  });

  it('should validate content-type for streaming responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    } as Response);

    await expect(client.sendMessage('test-conv', 'Hello', {
      requestBody: {
        model: "test/test-model",
        provider: "test-provider",
        query: "Hello",
      }
    })).rejects.toThrow(
      'Expected text/event-stream but got: application/json'
    );
  });

  it('should implement other IAIClient interface methods', async () => {
    const initResult = await client.init();
    expect(initResult.conversations).toEqual([]);

    const historyResult = await client.getConversationHistory('test-conv');
    expect(historyResult).toEqual([]);

    const newConv = await client.createNewConversation();
    expect(newConv.id).toBe('__aai_temp_conversation__');
  });

  it('should omit conversation_id for temporary conversations', async () => {
    const mockSSEData = 'data: {"event":"start","data":{"conversation_id":"real-conv-id","message_id":"msg-123"}}\n\n';
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(mockSSEData));
        controller.close();
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: mockStream,
    } as Response);

    await client.sendMessage('__temp_conversation__', 'Hello temp', {
      stream: true,
      requestBody: {
        model: "test/test-model",
        provider: "test-provider",
        query: "placeholder", // Will be overridden by the message parameter
      }
    });
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/ai/streaming_chat/',
      expect.objectContaining({
        body: JSON.stringify({
          media_type: "application/json",
          model: "test/test-model",
          provider: "test-provider",
          query: "Hello temp",
          // No conversation_id should be included
        }),
      })
    );
  });

  it('should omit conversation_id for AAI temporary conversations', async () => {
    const mockSSEData = 'data: {"event":"start","data":{"conversation_id":"real-conv-id","message_id":"msg-123"}}\n\n';
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(mockSSEData));
        controller.close();
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: mockStream,
    } as Response);

    await client.sendMessage('__aai_temp_conversation__', 'Hello AAI temp', {
      stream: true,
      requestBody: {
        model: "test/test-model",
        provider: "test-provider",
        query: "placeholder", // Will be overridden by the message parameter
      }
    });
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/ai/streaming_chat/',
      expect.objectContaining({
        body: JSON.stringify({
          media_type: "application/json",
          model: "test/test-model",
          provider: "test-provider",
          query: "Hello AAI temp",
          // No conversation_id should be included for AAI temp conversations either
        }),
      })
    );
  });
});