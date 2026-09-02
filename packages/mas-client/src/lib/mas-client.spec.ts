import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';
import { MASAdditionalAttributes } from './types';
import { MASClient } from './client';

const mockFetch = jest.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ndjsonStream = (...events: object[]): ReadableStream<Uint8Array> => {
  const text = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(bytes);
      ctrl.close();
    },
  });
};

const completedChatState = (output = 'Answer') => ({
  ok: true,
  json: () =>
    Promise.resolve({
      messages: [],
      output,
      status: 'COMPLETED',
      status_message: null,
    }),
});

// ---------------------------------------------------------------------------

describe('MASClient', () => {
  let client: MASClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new MASClient({
      baseUrl: 'http://localhost:8002',
      blueprintId: 'test-blueprint-123',
      fetchFunction: mockFetch,
    });
  });

  // -------------------------------------------------------------------------
  // healthCheck
  // -------------------------------------------------------------------------

  describe('healthCheck', () => {
    it('calls the health endpoint', async () => {
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

  // -------------------------------------------------------------------------
  // createNewConversation
  // -------------------------------------------------------------------------

  describe('createNewConversation', () => {
    it('creates a new session with blueprintId', async () => {
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
          body: JSON.stringify({ blueprintId: 'test-blueprint-123' }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // submitSession
  // -------------------------------------------------------------------------

  describe('submitSession', () => {
    it('submits a message to a session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessionId: 'session-abc-123' }),
      });

      const result = await client.submitSession({
        sessionId: 'session-abc-123',
        inputs: { user_prompt: 'Hello!' },
        scope: 'public',
      });
      expect(result.sessionId).toBe('session-abc-123');
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage — streaming
  // -------------------------------------------------------------------------

  describe('sendMessage (streaming)', () => {
    it('throws when called without stream:true', async () => {
      await expect(
        client.sendMessage('session-abc-123', 'Hello')
      ).rejects.toThrow(
        'Non-streaming sendMessage is not supported in MASClient'
      );
    });

    it('POSTs to submit then GETs subscribe, forwarding headers', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-abc-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: ndjsonStream({ type: 'stream_end' }),
        })
        .mockResolvedValueOnce(completedChatState(''));

      await client.sendMessage('session-abc-123', 'Hi', {
        stream: true,
        headers: { Authorization: 'Bearer tok' },
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:8002/api/sessions/user.session.submit',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8002/api/sessions/session.subscribe?sessionId=session-abc-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok',
            Accept: 'application/x-ndjson',
          }),
        })
      );
    });

    it('accumulates llm_token chunks and returns final answer', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-abc-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: ndjsonStream(
            {
              type: 'llm_token',
              node: 'n1',
              display_name: 'Alpha',
              chunk: 'Hello',
            },
            {
              type: 'llm_token',
              node: 'n1',
              display_name: 'Alpha',
              chunk: ' World',
            },
            { type: 'stream_end' }
          ),
        })
        .mockResolvedValueOnce(completedChatState('Hello World'));

      const chunks: string[] = [];
      const result = await client.sendMessage('session-abc-123', 'Hi', {
        stream: true,
        handleChunk: (c) => chunks.push(c.answer),
      });

      expect(chunks[0]).toBe('Thinking...');
      expect(chunks[1]).toBe('Thinking...');
      expect(result.answer).toBe('Hello World'); // real answer from getChatState after stream_end
    });

    it('assigns a unique messageId distinct from the conversationId', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-abc-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: ndjsonStream(
            {
              type: 'llm_token',
              node: 'n1',
              display_name: 'Alpha',
              chunk: 'Hi',
            },
            { type: 'stream_end' }
          ),
        })
        .mockResolvedValueOnce(completedChatState('Hi'));

      const seenIds = new Set<string>();
      const result = await client.sendMessage('session-abc-123', 'Hey', {
        stream: true,
        handleChunk: (c) => seenIds.add(c.messageId),
      });

      // messageId must be a UUID, not the conversationId
      expect(result.messageId).not.toBe('session-abc-123');
      expect(result.messageId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(result.conversationId).toBe('session-abc-123');
      // All intermediate chunks carried the same messageId as the final result
      expect(seenIds.size).toBe(1);
      expect(seenIds.has(result.messageId)).toBe(true);
    });

    it('tracks activeAgents: running during llm_token, done on complete', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-abc-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: ndjsonStream(
            {
              type: 'llm_token',
              node: 'n1',
              display_name: 'Alpha',
              chunk: 'Hi',
            },
            {
              type: 'complete',
              node: 'n1',
              display_name: 'Alpha',
              state: { output: 'Hi' },
            },
            { type: 'stream_end' }
          ),
        })
        .mockResolvedValueOnce(completedChatState('Hi'));

      const chunks: IStreamChunk<MASAdditionalAttributes>[] = [];
      const result = await client.sendMessage('session-abc-123', 'Hey', {
        stream: true,
        handleChunk: (c) => chunks.push(c),
      });

      expect(chunks[0].additionalAttributes.activeAgents).toEqual([
        { nodeId: 'n1', name: 'Alpha', status: 'running' },
      ]);
      // Final chunk (after getChatState) marks the agent done
      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.additionalAttributes.activeAgents).toEqual([
        { nodeId: 'n1', name: 'Alpha', status: 'done' },
      ]);
      expect(result.additionalAttributes?.activeAgents).toEqual([
        { nodeId: 'n1', name: 'Alpha', status: 'done' },
      ]);
    });

    it('emits an error chunk with status FAILED on stream_error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-abc-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          body: ndjsonStream(
            {
              type: 'llm_token',
              node: 'n1',
              display_name: 'Alpha',
              chunk: 'Partial',
            },
            {
              type: 'stream_error',
              node: 'n1',
              display_name: 'Alpha',
              error: 'Agent exploded',
            }
          ),
        })
        .mockResolvedValueOnce(completedChatState(''));

      const chunks: IStreamChunk<MASAdditionalAttributes>[] = [];
      await client.sendMessage('session-abc-123', 'Hi', {
        stream: true,
        handleChunk: (c) => chunks.push(c),
      });

      const errChunk = chunks.find(
        (c) => c.additionalAttributes?.status === 'FAILED'
      );
      expect(errChunk).toBeDefined();
      expect(errChunk!.additionalAttributes!.status_message).toBe(
        'Agent exploded'
      );
      expect(errChunk!.additionalAttributes!.activeAgents).toEqual([
        { nodeId: 'n1', name: 'Alpha', status: 'error' },
      ]);
    });

    it('calls cancelSession when the caller signal is aborted', async () => {
      const controller = new AbortController();

      // Spy on cancelSession so we can assert it was called without relying on
      // Node.js's async AbortSignal.any() composite-abort microtask timing.
      const cancelSpy = jest.spyOn(client, 'cancelSession').mockResolvedValue({
        sessionId: 'session-abc-123',
        status: 'CANCELLED',
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-abc-123' }),
        }) // submit
        .mockResolvedValueOnce({
          ok: true,
          body: ndjsonStream({ type: 'heartbeat' }, { type: 'stream_end' }),
        }) // subscribe
        .mockResolvedValueOnce(completedChatState('')); // getChatState after stream_end

      controller.abort();

      await client
        .sendMessage('session-abc-123', 'Hi', {
          stream: true,
          signal: controller.signal,
        })
        .catch(() => {});

      // Allow the fire-and-forget cancelSession microtask to settle
      await Promise.resolve();

      expect(cancelSpy).toHaveBeenCalledWith('session-abc-123');
    });
  });

  // -------------------------------------------------------------------------
  // getChatState
  // -------------------------------------------------------------------------

  describe('getChatState', () => {
    it('fetches chat state for a session', async () => {
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

  // -------------------------------------------------------------------------
  // listSessions
  // -------------------------------------------------------------------------

  describe('listSessions', () => {
    it('lists user sessions', async () => {
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

  // -------------------------------------------------------------------------
  // init
  // -------------------------------------------------------------------------

  describe('init', () => {
    it('returns conversations from session list', async () => {
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

  // -------------------------------------------------------------------------
  // getConversationHistory
  // -------------------------------------------------------------------------

  describe('getConversationHistory', () => {
    it('returns null for empty messages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ messages: [], output: '', status: 'PENDING' }),
      });

      const result = await client.getConversationHistory('session-abc-123');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // deleteConversation
  // -------------------------------------------------------------------------

  describe('deleteConversation', () => {
    it('deletes a session', async () => {
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

  // -------------------------------------------------------------------------
  // cancelSession
  // -------------------------------------------------------------------------

  describe('cancelSession', () => {
    it('cancels a running session', async () => {
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

  // -------------------------------------------------------------------------
  // error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws AIClientError on non-ok response', async () => {
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

    it('throws on 404 blueprint not found', async () => {
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
