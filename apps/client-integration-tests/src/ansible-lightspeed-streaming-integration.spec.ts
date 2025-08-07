import { AnsibleLightspeedClient } from '@redhat-cloud-services/ansible-lightspeed-client';
import type {
  AnsibleLightspeedConfig,
  QueryRequest,
  StreamingEvent,
  StreamingEventHandler,
  TokenEvent,
  TurnCompleteEvent,
} from '@redhat-cloud-services/ansible-lightspeed-client';
import { processStreamWithHandler } from '@redhat-cloud-services/ansible-lightspeed-client';

/**
 * Ansible Lightspeed Streaming Integration Tests
 *
 * These tests use the Ansible Lightspeed mock server for real streaming integration testing.
 * The mock server must be running at http://localhost:3003 for these tests to pass.
 *
 * Start the mock server with: node ansible-lightspeed-mock-server.js
 *
 * The mock server implements the exact streaming format:
 * - data: {"event": "start", "data": {"conversation_id": "uuid"}}
 * - data: {"event": "token", "data": {"id": 0, "role": "inference", "token": "text"}}
 * - data: {"event": "turn_complete", "data": {"id": N, "token": "full_response"}}
 * - data: {"event": "end", "data": {"referenced_documents": [], "input_tokens": N, "output_tokens": N}}
 */
describe('Ansible Lightspeed Streaming Integration Tests', () => {
  let client: AnsibleLightspeedClient;
  const mockServerUrl = 'http://localhost:3003';

  beforeEach(() => {
    const config: AnsibleLightspeedConfig = {
      baseUrl: mockServerUrl,
    };

    client = new AnsibleLightspeedClient(config);
  });

  beforeAll(async () => {
    // Check if mock server is running
    try {
      const response = await fetch(`${mockServerUrl}/v1/info`);
      if (!response.ok) {
        throw new Error('Mock server not responding');
      }
    } catch (error) {
      throw new Error(
        `Mock server not running at ${mockServerUrl}. Start it with: node ansible-lightspeed-mock-server.js`
      );
    }
  });

  describe('Streaming Response Handling', () => {
    it('should have streaming query method available', () => {
      expect(typeof client.streamingQuery).toBe('function');
      expect(typeof processStreamWithHandler).toBe('function');
    });

    it('should receive streaming response from mock server', async () => {
      const queryRequest: QueryRequest = {
        query: 'How do I use Ansible modules?',
        conversation_id: 'stream-test-123',
      };

      const stream = await client.streamingQuery(queryRequest);
      expect(stream).toBeInstanceOf(ReadableStream);

      const events: StreamingEvent[] = [];
      let completed = false;
      const errors: Error[] = [];

      await processStreamWithHandler(stream, {
        onEvent: (event) => {
          events.push(event);
        },
        onComplete: () => {
          completed = true;
        },
        onError: (error) => {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(0);
      expect(completed).toBe(true);
      expect(events.length).toBeGreaterThan(0);

      // Should have at least start, token(s), turn_complete, and end events
      const startEvents = events.filter((e) => e.event === 'start');
      const tokenEvents = events.filter((e) => e.event === 'token');
      const turnCompleteEvents = events.filter(
        (e) => e.event === 'turn_complete'
      );
      const endEvents = events.filter((e) => e.event === 'end');

      expect(startEvents).toHaveLength(1);
      expect(tokenEvents.length).toBeGreaterThan(0);
      expect(turnCompleteEvents).toHaveLength(1);
      expect(endEvents).toHaveLength(1);

      // Verify start event has conversation_id
      expect(startEvents[0].data).toHaveProperty('conversation_id');
      expect(typeof startEvents[0].data.conversation_id).toBe('string');
    });

    it('should process streaming events with handler from mock server', async () => {
      const events: StreamingEvent[] = [];
      const errors: Error[] = [];
      let completed = false;

      const onEvent: StreamingEventHandler = (event) => {
        events.push(event);
      };

      const onError = (error: Error) => {
        errors.push(error);
      };

      const onComplete = () => {
        completed = true;
      };

      const queryRequest: QueryRequest = {
        query: 'How do I copy files with Ansible?',
        conversation_id: 'conv-stream-456',
      };

      const stream = await client.streamingQuery(queryRequest);

      // Process the stream
      await processStreamWithHandler(stream, {
        onEvent,
        onError,
        onComplete,
      });

      // Verify events were processed correctly
      expect(errors).toHaveLength(0);
      expect(completed).toBe(true);
      expect(events.length).toBeGreaterThan(0);

      // Verify we have the expected event types
      const startEvents = events.filter((e) => e.event === 'start');
      const tokenEvents = events.filter((e) => e.event === 'token');
      const turnCompleteEvents = events.filter(
        (e) => e.event === 'turn_complete'
      );
      const endEvents = events.filter((e) => e.event === 'end');

      expect(startEvents).toHaveLength(1);
      expect(tokenEvents.length).toBeGreaterThan(0);
      expect(turnCompleteEvents).toHaveLength(1);
      expect(endEvents).toHaveLength(1);

      // Verify start event structure
      expect(startEvents[0].event).toBe('start');
      expect(startEvents[0].data).toHaveProperty('conversation_id');

      // Verify token events structure
      tokenEvents.forEach((event) => {
        expect(event.event).toBe('token');
        expect(event.data).toHaveProperty('id');
        expect(event.data).toHaveProperty('role', 'inference');
        expect(event.data).toHaveProperty('token');
        expect(typeof event.data.token).toBe('string');
      });

      // Verify turn_complete event structure
      expect(turnCompleteEvents[0].event).toBe('turn_complete');
      expect(turnCompleteEvents[0].data).toHaveProperty('id');
      expect(turnCompleteEvents[0].data).toHaveProperty('token');
      expect(typeof turnCompleteEvents[0].data.token).toBe('string');

      // Verify end event structure
      expect(endEvents[0].event).toBe('end');
      expect(endEvents[0].data).toHaveProperty('referenced_documents');
      expect(endEvents[0].data).toHaveProperty('input_tokens');
      expect(endEvents[0].data).toHaveProperty('output_tokens');
    });

    it('should handle invalid query gracefully', async () => {
      // Test with empty query which should trigger server validation error
      const queryRequest: QueryRequest = {
        query: '', // Empty query should cause 422 error
      };

      await expect(client.streamingQuery(queryRequest)).rejects.toThrow();
    });

    it('should reconstruct full response from token events from mock server', async () => {
      const tokenEvents: StreamingEvent[] = [];
      let fullResponse = '';
      let turnCompleteResponse = '';

      const onEvent: StreamingEventHandler = (event) => {
        if (event.event === 'token') {
          const tokenEvent = event as TokenEvent;
          tokenEvents.push(tokenEvent);
          fullResponse += tokenEvent.data.token;
        } else if (event.event === 'turn_complete') {
          const turnCompleteEvent = event as TurnCompleteEvent;
          turnCompleteResponse = turnCompleteEvent.data.token;
        }
      };

      const queryRequest: QueryRequest = {
        query: 'How do I manage services with Ansible?',
        conversation_id: 'conv-tokens',
      };

      const stream = await client.streamingQuery(queryRequest);
      await processStreamWithHandler(stream, { onEvent });

      // Verify tokens were received
      expect(tokenEvents.length).toBeGreaterThan(0);

      // Verify each token has the expected structure
      tokenEvents.forEach((event, index) => {
        // Type assertion since we know these are token events
        const tokenEvent = event as TokenEvent;
        expect(tokenEvent.data).toHaveProperty('id', index);
        expect(tokenEvent.data).toHaveProperty('role', 'inference');
        expect(tokenEvent.data).toHaveProperty('token');
        expect(typeof tokenEvent.data.token).toBe('string');
      });

      // Verify full response reconstruction matches turn_complete
      expect(fullResponse).toBe(turnCompleteResponse);
      expect(fullResponse.length).toBeGreaterThan(0);
    });
  });

  describe('Streaming Error Handling', () => {
    it('should handle missing query field', async () => {
      const queryRequest: QueryRequest = {
        query: '', // Empty query should cause validation error
      };

      await expect(client.streamingQuery(queryRequest)).rejects.toThrow();
    });

    it('should handle network errors gracefully', async () => {
      // Create client with invalid URL to simulate network error
      const invalidClient = new AnsibleLightspeedClient({
        baseUrl: 'http://nonexistent-server:9999',
      });

      const queryRequest: QueryRequest = {
        query: 'This will cause a network error',
      };

      await expect(
        invalidClient.streamingQuery(queryRequest)
      ).rejects.toThrow();
    });
  });

  describe('Mock Server Conversation Management', () => {
    it('should handle conversation_id in streaming responses', async () => {
      const conversationId = 'test-conversation-123';
      const events: StreamingEvent[] = [];

      const queryRequest: QueryRequest = {
        query: 'How do I install packages with Ansible?',
        conversation_id: conversationId,
      };

      const stream = await client.streamingQuery(queryRequest);

      await processStreamWithHandler(stream, {
        onEvent: (event) => {
          events.push(event);
        },
      });

      // Find the start event and verify it contains the conversation_id
      const startEvents = events.filter((e) => e.event === 'start');
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0].data.conversation_id).toBe(conversationId);
    });

    it('should generate conversation_id when not provided', async () => {
      const events: StreamingEvent[] = [];

      const queryRequest: QueryRequest = {
        query: 'How do I restart services with Ansible?',
        // No conversation_id provided
      };

      const stream = await client.streamingQuery(queryRequest);

      await processStreamWithHandler(stream, {
        onEvent: (event) => {
          events.push(event);
        },
      });

      // Find the start event and verify it contains a generated conversation_id
      const startEvents = events.filter((e) => e.event === 'start');
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0].data.conversation_id).toBeDefined();
      expect(typeof startEvents[0].data.conversation_id).toBe('string');
      expect(startEvents[0].data.conversation_id.length).toBeGreaterThan(0);
    });

    it('should handle multiple concurrent streaming requests', async () => {
      const request1: QueryRequest = {
        query: 'How do I copy files?',
        conversation_id: 'concurrent-1',
      };

      const request2: QueryRequest = {
        query: 'How do I manage users?',
        conversation_id: 'concurrent-2',
      };

      const [stream1, stream2] = await Promise.all([
        client.streamingQuery(request1),
        client.streamingQuery(request2),
      ]);

      const events1: StreamingEvent[] = [];
      const events2: StreamingEvent[] = [];

      await Promise.all([
        processStreamWithHandler(stream1, {
          onEvent: (event) => events1.push(event),
        }),
        processStreamWithHandler(stream2, {
          onEvent: (event) => events2.push(event),
        }),
      ]);

      // Both streams should complete successfully
      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);

      // Verify conversation IDs are preserved
      const start1 = events1.find((e) => e.event === 'start');
      const start2 = events2.find((e) => e.event === 'start');

      expect(start1?.data.conversation_id).toBe('concurrent-1');
      expect(start2?.data.conversation_id).toBe('concurrent-2');
    });
  });
});
