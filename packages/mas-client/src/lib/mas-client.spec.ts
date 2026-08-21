import { MASClient } from './client';

const mockFetch = jest.fn();

describe('MASClient', () => {
  let client: MASClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MASClient({
      baseUrl: 'http://localhost:8002',
      blueprintId: 'test-blueprint-123',
      fetchFunction: mockFetch,
    });
  });

  describe('healthCheck', () => {
    it('should call the health endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ status: 'ok', message: 'Server is healthy' }),
      });

      const result = await client.healthCheck();
      expect(result).toEqual({ status: 'ok', message: 'Server is healthy' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8002/api/health/',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('createNewConversation', () => {
    it('should create a new session with blueprintId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve('session-abc-123'),
      });

      const result = await client.createNewConversation();
      expect(result.id).toBe('session-abc-123');
      expect(result.title).toBe('New Conversation');
      expect(result.locked).toBe(false);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8002/api/sessions/user.session.create',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            blueprintId: 'test-blueprint-123',
          }),
        })
      );
    });
  });

  describe('submitSession', () => {
    it('should submit a message to a session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: 'session-abc-123',
            workflowId: 'wf-456',
          }),
      });

      const result = await client.submitSession({
        sessionId: 'session-abc-123',
        inputs: { user_prompt: 'Hello!' },
        scope: 'public',
      });
      expect(result.sessionId).toBe('session-abc-123');
      expect(result.workflowId).toBe('wf-456');
    });
  });

  describe('getChatState', () => {
    it('should fetch chat state for a session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ],
            output: 'Hi there!',
            status: 'COMPLETED',
            status_message: null,
          }),
      });

      const result = await client.getChatState('session-abc-123');
      expect(result.messages).toHaveLength(2);
      expect(result.output).toBe('Hi there!');
      expect(result.status).toBe('COMPLETED');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8002/api/sessions/session.chat.get?sessionId=session-abc-123',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('listSessions', () => {
    it('should list user sessions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              session_id: 'session-1',
              blueprint_id: 'bp-1',
              started_at: '2026-01-01T00:00:00Z',
              blueprint_exists: true,
              metadata: { title: 'My Chat' },
            },
          ]),
      });

      const result = await client.listSessions();
      expect(result).toHaveLength(1);
      expect(result[0].session_id).toBe('session-1');
    });
  });

  describe('init', () => {
    it('should initialize and return conversations from session list', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ status: 'ok', message: 'Server is healthy' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                session_id: 'session-1',
                blueprint_id: 'bp-1',
                started_at: '2026-01-01T00:00:00Z',
                blueprint_exists: true,
                metadata: { title: 'My Chat' },
              },
              {
                session_id: 'session-2',
                blueprint_id: 'bp-1',
                started_at: '2026-01-02T00:00:00Z',
                blueprint_exists: true,
                metadata: {},
              },
            ]),
        });

      const result = await client.init();
      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0].id).toBe('session-1');
      expect(result.conversations[0].title).toBe('My Chat');
      expect(result.conversations[1].title).toBe('Session session-');
    });
  });

  describe('getConversationHistory', () => {
    it('should return conversation history from chat state', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ],
            output: 'Hi there!',
            status: 'COMPLETED',
            status_message: null,
          }),
      });

      const result = await client.getConversationHistory('session-abc-123');
      expect(result).toHaveLength(2);
      expect(result![0].input).toBe('Hello');
      expect(result![1].answer).toBe('Hi there!');
    });

    it('should return null for empty messages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [],
            output: '',
            status: 'PENDING',
          }),
      });

      const result = await client.getConversationHistory('session-abc-123');
      expect(result).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('should delete a session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await client.deleteConversation('session-abc-123');
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8002/api/sessions/session.delete?sessionId=session-abc-123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('cancelSession', () => {
    it('should cancel a running session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: 'session-abc-123',
            status: 'CANCELLED',
          }),
      });

      const result = await client.cancelSession('session-abc-123');
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('error handling', () => {
    it('should throw AIClientError on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(client.healthCheck()).rejects.toThrow(
        'API request failed: 500 - Server error'
      );
    });

    it('should throw AIClientError on 404 blueprint not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () =>
          Promise.resolve({
            error: 'Blueprint not found',
            error_type: 'BLUEPRINT_NOT_FOUND',
            blueprint_id: 'bad-id',
          }),
      });

      await expect(client.createNewConversation()).rejects.toThrow();
    });
  });
});
