import { HCCAIAssistantClient } from './client';
import {
  HCCAIAssistantClientConfig,
  HCCAIAssistantUnauthorizedError,
  HCCAIAssistantValidationError,
  HCCAIAssistantQuotaExceededError,
  HCCAIAssistantServerError,
  extractErrorMessage,
} from './types';
import { AIClientError } from '@redhat-cloud-services/ai-client-common';

const BASE_URL = 'https://api.example.com';
const QUERY_URL = `${BASE_URL}/v1/query`;
const HEALTH_URL = `${BASE_URL}/v1/health`;
const TEMP_CONVERSATION_ID = '__temp_hcc_ai_assistant_conversation__';

function mockErrorResponse(
  status: number,
  statusText: string,
  body: unknown = {}
): Response {
  return {
    ok: false,
    status,
    statusText,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('HCCAIAssistantClient', () => {
  let client: HCCAIAssistantClient;
  let config: HCCAIAssistantClientConfig;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let mockResponse: Partial<Response>;

  const defaultConfig: HCCAIAssistantClientConfig = {
    baseUrl: BASE_URL,
    provider: 'google-vertex',
    model: 'publishers/google/models/gemini-2.5-flash',
    generateTopicSummary: false,
  };

  const mockAPIResponse = {
    conversation_id: 'conv-abc123',
    response: 'Here are the principals in your organization.',
    rag_chunks: [],
    referenced_documents: [{ title: 'RBAC docs', url: 'https://example.com' }],
    truncated: false,
    input_tokens: 1500,
    output_tokens: 42,
    available_quotas: {},
    tool_calls: [],
    tool_results: [],
  };

  function getRequestBody(): Record<string, unknown> {
    return JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
  }

  beforeEach(() => {
    mockFetch = jest.fn();
    mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn().mockResolvedValue(mockAPIResponse),
    };
    mockFetch.mockResolvedValue(mockResponse as Response);

    config = { ...defaultConfig, fetchFunction: mockFetch };
    client = new HCCAIAssistantClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with required config', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(HCCAIAssistantClient);
    });

    it('should strip trailing slash from baseUrl', async () => {
      const trailingSlashClient = new HCCAIAssistantClient({
        ...config,
        baseUrl: `${BASE_URL}/`,
      });

      await trailingSlashClient.sendMessage(TEMP_CONVERSATION_ID, 'hello');

      expect(mockFetch).toHaveBeenCalledWith(QUERY_URL, expect.any(Object));
    });

    it('should omit optional fields when not provided', async () => {
      const minimalClient = new HCCAIAssistantClient({
        baseUrl: 'https://example.com',
        fetchFunction: mockFetch,
      });

      await minimalClient.sendMessage(TEMP_CONVERSATION_ID, 'hello');

      const body = getRequestBody();
      expect(body['query']).toBe('hello');
      expect(body['provider']).toBeUndefined();
      expect(body['model']).toBeUndefined();
      expect(body['generate_topic_summary']).toBeUndefined();
    });
  });

  describe('init', () => {
    it('should fetch conversations from /v1/conversations', async () => {
      (mockResponse.json as jest.Mock).mockResolvedValue({
        conversations: [
          {
            conversation_id: 'conv-1',
            topic_summary: 'RBAC principals',
            created_at: '2025-01-15T10:00:00Z',
            last_message_at: '2025-01-15T10:05:00Z',
            message_count: 3,
            last_used_model: null,
            last_used_provider: null,
          },
          {
            conversation_id: 'conv-2',
            topic_summary: null,
            created_at: null,
            last_message_at: null,
            message_count: null,
            last_used_model: null,
            last_used_provider: null,
          },
        ],
      });

      const result = await client.init();

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/v1/conversations`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0]).toEqual({
        id: 'conv-1',
        title: 'RBAC principals',
        locked: false,
        createdAt: new Date('2025-01-15T10:00:00Z'),
      });
      expect(result.conversations[1]).toEqual({
        id: 'conv-2',
        title: 'New Conversation',
        locked: false,
        createdAt: expect.any(Date),
      });
    });
  });

  describe('createNewConversation', () => {
    it('should return a conversation with the temp ID', async () => {
      const conversation = await client.createNewConversation();

      expect(conversation).toEqual({
        id: TEMP_CONVERSATION_ID,
        title: 'New Conversation',
        locked: false,
        createdAt: expect.any(Date),
      });
    });
  });

  describe('getConversationHistory', () => {
    it('should fetch and map conversation turns to messages', async () => {
      (mockResponse.json as jest.Mock).mockResolvedValue({
        conversation_id: 'conv-1',
        chat_history: [
          {
            messages: [
              { content: 'List my principals', type: 'user' },
              {
                content: 'Here are your principals.',
                type: 'assistant',
                referenced_documents: [
                  { doc_title: 'RBAC docs', doc_url: 'https://example.com' },
                ],
              },
            ],
            provider: 'google-vertex',
            model: 'gemini-2.5-flash',
            started_at: '2025-01-15T10:00:00Z',
            completed_at: '2025-01-15T10:00:05Z',
          },
        ],
      });

      const history = await client.getConversationHistory('conv-1');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/v1/conversations/conv-1`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(history).toHaveLength(2);
      expect(history![0]).toEqual({
        message_id: expect.any(String),
        answer: '',
        input: 'List my principals',
        date: new Date('2025-01-15T10:00:00Z'),
        additionalAttributes: undefined,
      });
      expect(history![1]).toEqual({
        message_id: expect.any(String),
        answer: 'Here are your principals.',
        input: '',
        date: new Date('2025-01-15T10:00:00Z'),
        additionalAttributes: {
          referencedDocuments: [
            { doc_title: 'RBAC docs', doc_url: 'https://example.com' },
          ],
        },
      });
    });

    it('should filter out system and developer messages', async () => {
      (mockResponse.json as jest.Mock).mockResolvedValue({
        conversation_id: 'conv-1',
        chat_history: [
          {
            messages: [
              { content: 'System prompt', type: 'system' },
              { content: 'Hello', type: 'user' },
              { content: 'Dev note', type: 'developer' },
              { content: 'Hi there!', type: 'assistant' },
            ],
            provider: 'google-vertex',
            model: 'gemini-2.5-flash',
            started_at: '2025-01-15T10:00:00Z',
            completed_at: '2025-01-15T10:00:05Z',
          },
        ],
      });

      const history = await client.getConversationHistory('conv-1');

      expect(history).toHaveLength(2);
      expect(history![0]['input']).toBe('Hello');
      expect(history![1]['answer']).toBe('Hi there!');
    });
  });

  describe('healthCheck', () => {
    it('should make GET request to /v1/health', async () => {
      const healthData = { status: 'healthy' };
      (mockResponse.json as jest.Mock).mockResolvedValue(healthData);

      const result = await client.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(HEALTH_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      expect(result).toEqual(healthData);
    });

    it('should pass custom headers', async () => {
      (mockResponse.json as jest.Mock).mockResolvedValue({});

      await client.healthCheck({ headers: { Authorization: 'Bearer token' } });

      expect(mockFetch).toHaveBeenCalledWith(HEALTH_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token',
        },
      });
    });

    it('should pass abort signal', async () => {
      (mockResponse.json as jest.Mock).mockResolvedValue({});
      const controller = new AbortController();

      await client.healthCheck({ signal: controller.signal });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  describe('sendMessage', () => {
    it('should POST to /v1/query with provider and model', async () => {
      await client.sendMessage('conv-123', 'List my principals');

      expect(mockFetch).toHaveBeenCalledWith(QUERY_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'List my principals',
          provider: 'google-vertex',
          model: 'publishers/google/models/gemini-2.5-flash',
          generate_topic_summary: false,
          conversation_id: 'conv-123',
        }),
      });
    });

    it('should omit conversation_id for the temp conversation ID', async () => {
      await client.sendMessage(TEMP_CONVERSATION_ID, 'Hello');
      expect(getRequestBody()['conversation_id']).toBeUndefined();
    });

    it('should include conversation_id for real conversations', async () => {
      await client.sendMessage('real-conv-id', 'Hello');
      expect(getRequestBody()['conversation_id']).toBe('real-conv-id');
    });

    it('should map API response to IMessageResponse', async () => {
      const result = await client.sendMessage('conv-123', 'test');

      expect(result.answer).toBe(
        'Here are the principals in your organization.'
      );
      expect(result.conversationId).toBe('conv-abc123');
      expect(result.date).toBeInstanceOf(Date);
      expect(result.messageId).toBeDefined();
      expect(result.additionalAttributes).toEqual({
        referencedDocuments: [
          { title: 'RBAC docs', url: 'https://example.com' },
        ],
        truncated: false,
        inputTokens: 1500,
        outputTokens: 42,
      });
    });

    it('should use the configured generateTopicSummary value', async () => {
      const summaryClient = new HCCAIAssistantClient({
        ...config,
        generateTopicSummary: true,
      });

      await summaryClient.sendMessage(TEMP_CONVERSATION_ID, 'Hello');
      expect(getRequestBody()['generate_topic_summary']).toBe(true);
    });

    it('should pass custom headers', async () => {
      await client.sendMessage('conv-123', 'test', {
        headers: { 'X-Request-ID': 'req-456' },
      });

      const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers;
      expect(headers).toEqual(
        expect.objectContaining({ 'X-Request-ID': 'req-456' })
      );
    });

    it('should pass abort signal', async () => {
      const controller = new AbortController();

      await client.sendMessage('conv-123', 'test', {
        signal: controller.signal,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  describe('extractErrorMessage', () => {
    it('should extract from Lightspeed Stack format', () => {
      expect(
        extractErrorMessage(
          { detail: { response: 'Something failed', cause: 'Unknown' } },
          'fallback'
        )
      ).toBe('Something failed');
    });

    it('should extract from FastAPI validation format', () => {
      expect(
        extractErrorMessage({ detail: [{ msg: 'field required' }] }, 'fallback')
      ).toBe('field required');
    });

    it('should extract from message field', () => {
      expect(extractErrorMessage({ message: 'Not found' }, 'fallback')).toBe(
        'Not found'
      );
    });

    it('should extract from error field', () => {
      expect(extractErrorMessage({ error: 'Bad request' }, 'fallback')).toBe(
        'Bad request'
      );
    });

    it('should return fallback for null body', () => {
      expect(extractErrorMessage(null, 'fallback')).toBe('fallback');
    });

    it('should return fallback for non-object body', () => {
      expect(extractErrorMessage('string', 'fallback')).toBe('fallback');
    });

    it('should return fallback when no recognized fields exist', () => {
      expect(extractErrorMessage({ unrelated: true }, 'fallback')).toBe(
        'fallback'
      );
    });

    it('should return fallback for empty detail array', () => {
      expect(extractErrorMessage({ detail: [] }, 'fallback')).toBe('fallback');
    });

    it('should return fallback when detail object has no response field', () => {
      expect(
        extractErrorMessage({ detail: { cause: 'something' } }, 'fallback')
      ).toBe('fallback');
    });
  });

  describe('error handling', () => {
    it('should throw HCCAIAssistantUnauthorizedError for 401 responses', async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse(401, 'Unauthorized', {
          detail: {
            response: 'Missing or invalid credentials provided by client',
            cause: 'No token found',
          },
        })
      );

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        HCCAIAssistantUnauthorizedError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'Missing or invalid credentials provided by client'
      );
    });

    it('should throw HCCAIAssistantValidationError for 422 responses', async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse(422, 'Unprocessable Entity', {
          detail: [{ msg: 'Query is required' }],
        })
      );

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        HCCAIAssistantValidationError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'Query is required'
      );
    });

    it('should throw HCCAIAssistantQuotaExceededError for 429 responses', async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse(429, 'Too Many Requests', {
          detail: {
            response:
              'The token quota for model gpt-4-turbo has been exceeded.',
            cause: 'User has no available tokens',
          },
        })
      );

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        HCCAIAssistantQuotaExceededError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'The token quota for model gpt-4-turbo has been exceeded.'
      );
    });

    it('should throw HCCAIAssistantServerError for 500+ responses', async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse(500, 'Internal Server Error', {
          detail: {
            response: 'An unexpected error occurred',
            cause: 'Backend unavailable',
          },
        })
      );

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        HCCAIAssistantServerError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'An unexpected error occurred'
      );
    });

    it('should throw HCCAIAssistantServerError for 502 responses', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(502, 'Bad Gateway'));

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        HCCAIAssistantServerError
      );
    });

    it('should throw AIClientError for unhandled 4xx responses', async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse(403, 'Forbidden', {
          detail: {
            response: 'User does not have permission to access this endpoint',
          },
        })
      );

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        AIClientError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'User does not have permission to access this endpoint'
      );
    });

    it('should extract message from FastAPI validation format', async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse(422, 'Unprocessable Entity', {
          detail: [{ msg: 'field required' }],
        })
      );

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'field required'
      );
    });

    it('should use status text as fallback when error body has no detail', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(404, 'Not Found'));

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'HTTP 404'
      );
    });

    it('should handle unparseable JSON in error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as unknown as Response);

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        HCCAIAssistantServerError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'Server error'
      );
    });

    it('should wrap network errors in AIClientError', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        AIClientError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'Failed to fetch'
      );
    });

    it('should wrap non-Error throws in AIClientError', async () => {
      mockFetch.mockRejectedValue('something went wrong');

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        AIClientError
      );
      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        'An unknown error occurred'
      );
    });

    it('should re-throw AIClientError without wrapping', async () => {
      const original = new AIClientError(
        429,
        'Too Many Requests',
        'Rate limited'
      );
      mockFetch.mockRejectedValue(original);

      await expect(client.sendMessage('conv', 'test')).rejects.toThrow(
        original
      );
    });

    it('should propagate errors from healthCheck', async () => {
      mockFetch.mockRejectedValue(new Error('Health check failed'));

      await expect(client.healthCheck()).rejects.toThrow(AIClientError);
      await expect(client.healthCheck()).rejects.toThrow('Health check failed');
    });
  });
});
