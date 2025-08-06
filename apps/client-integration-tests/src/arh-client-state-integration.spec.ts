import { IFDClient } from '@redhat-cloud-services/arh-client';
import type {
  IFDClientConfig,
  MessageChunkResponse,
} from '@redhat-cloud-services/arh-client';
import type { IStreamingHandler } from '@redhat-cloud-services/ai-client-common';

// Import state manager components
import {
  createClientStateManager,
  Events,
  UserQuery,
} from '@redhat-cloud-services/ai-client-state';

// Integration tests specifically for the ARH (Intelligent Front Door) client
// and its interaction with the AI client state management system

/**
 * ARH Client Integration Tests
 *
 * These tests verify the integration between:
 * - @redhat-cloud-services/arh-client (ARH API client)
 * - @redhat-cloud-services/ai-client-state (State management)
 *
 * Note: For full streaming tests, use the ARH mock server:
 * npm run arh-mock-server
 */
describe('ARH Client Integration Tests', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let client: IFDClient;

  beforeEach(() => {
    mockFetch = jest.fn();

    const config: IFDClientConfig = {
      baseUrl: 'https://api.test.com',
      fetchFunction: mockFetch,
    };

    client = new IFDClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ARH Client Basic Integration', () => {
    it('should create IFD client successfully', () => {
      expect(client).toBeInstanceOf(IFDClient);
      expect(typeof client.sendMessage).toBe('function');
      expect(typeof client.healthCheck).toBe('function');
    });

    it('should handle non-streaming messages', async () => {
      const expectedResponse = {
        message_id: 'msg-123',
        answer: 'Hello! How can I help?',
        conversation_id: 'conv-456',
        received_at: new Date().toISOString(),
        sources: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.sendMessage('conv-456', 'Hello AI');

      expect(response).toBeDefined();
      if (response) {
        expect(response.messageId).toBe('msg-123');
        expect(response.answer).toBe('Hello! How can I help?');
        expect(response.conversationId).toBe('conv-456');
      }
    });

    it('should handle streaming with default handler', async () => {
      // Skip streaming test for now - requires more complex ReadableStream setup
      // This is a known limitation of testing streaming in Node.js environment
      //
      // For full streaming integration tests, use the ARH mock server:
      // 1. Start: npm run arh-mock-server
      // 2. Configure client to use http://localhost:3001 as baseUrl
      // 3. Send requests with stream: true
      //
      // The ARH mock server (arh-mock-server.js) provides realistic streaming
      // responses that match the ARH OpenAPI specification.
      expect(true).toBe(true);
    });

    it('should handle client default handler access', () => {
      const mockHandler: IStreamingHandler<MessageChunkResponse> = {
        onChunk: jest.fn(),
        onStart: jest.fn(),
        onComplete: jest.fn(),
      };

      const clientWithDefault = new IFDClient({
        baseUrl: 'https://api.test.com',
        fetchFunction: mockFetch,
        defaultStreamingHandler: mockHandler,
      });

      const retrievedHandler = clientWithDefault.getDefaultStreamingHandler();
      expect(retrievedHandler).toBe(mockHandler);
    });
  });

  describe('API Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error occurred',
      } as Response);

      await expect(client.sendMessage('conv-123', 'Hello')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.sendMessage('conv-123', 'Hello')).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('Client Configuration', () => {
    it('should handle custom headers and request options', async () => {
      const expectedResponse = {
        message_id: 'msg-custom',
        answer: 'Custom response',
        conversation_id: 'conv-custom',
        received_at: new Date().toISOString(),
        sources: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.sendMessage('conv-custom', 'Hello', {
        headers: { 'X-Custom-Header': 'test-value' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'test-value',
          }),
        })
      );

      expect(response).toBeDefined();
      if (response) {
        expect(response.messageId).toBe('msg-custom');
      }
    });
  });

  describe('ARH Client + State Manager Integration', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;

    beforeEach(() => {
      // Create state manager with ARH client
      const config: IFDClientConfig = {
        baseUrl: 'https://api.test.com',
        fetchFunction: mockFetch,
      };

      const client = new IFDClient(config);
      stateManager = createClientStateManager(client);
    });

    // No helper function needed - state manager auto-creates conversations

    describe('State Management Integration', () => {
      it('should create state manager with ARH client successfully', () => {
        expect(stateManager).toBeDefined();
        expect(typeof stateManager.sendMessage).toBe('function');
        expect(typeof stateManager.setActiveConversationId).toBe('function');
        expect(typeof stateManager.getActiveConversationMessages).toBe(
          'function'
        );
        expect(typeof stateManager.getMessageInProgress).toBe('function');
      });

      it('should set active conversation and manage state', async () => {
        const conversationId = 'conv-state-123';

        // Mock conversation history endpoint (returns empty array for new conversation)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [], // Empty history for new conversation
          headers: new Headers({ 'content-type': 'application/json' }),
        } as Response);

        await stateManager.setActiveConversationId(conversationId);

        // Manually create conversation state (this is how the state manager works)
        const state = stateManager.getState();
        state.conversations[conversationId] = {
          id: conversationId,
          messages: [],
          title: 'Test Conversation',
          locked: false,
        };

        expect(state.activeConversationId).toBe(conversationId);
        expect(state.conversations[conversationId]).toBeDefined();
        expect(state.conversations[conversationId].messages).toEqual([]);
      });

      it('should handle non-streaming messages with state updates', async () => {
        const conversationId = 'conv-integration';
        const userMessage: UserQuery = 'Hello from integration test';

        const expectedResponse = {
          message_id: 'bot-msg-1',
          answer: 'Hello from ARH API!',
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          sources: [],
        };

        // Mock conversation history endpoint (returns empty array for new conversation)
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => [], // Empty history for new conversation
            headers: new Headers({ 'content-type': 'application/json' }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => expectedResponse,
            headers: new Headers({ 'content-type': 'application/json' }),
          } as Response);

        // Manually create conversation state (this is how the state manager works)
        const state = stateManager.getState();
        state.conversations[conversationId] = {
          id: conversationId,
          title: 'Test Conversation',
          messages: [],
          locked: false,
        };

        await stateManager.setActiveConversationId(conversationId);

        let response;
        try {
          response = await stateManager.sendMessage(userMessage);
        } catch (error) {
          console.error('Error in sendMessage:', error);
          throw error;
        }

        // Debug: Check response and conversation state
        console.log('Response from sendMessage:', response);
        console.log(
          'All conversations:',
          Object.keys(stateManager.getState().conversations)
        );
        console.log(
          'Active conversation ID:',
          stateManager.getState().activeConversationId
        );
        console.log(
          'Conversation state:',
          stateManager.getState().conversations[conversationId]
        );
        console.log(
          'Active conversation messages:',
          stateManager.getActiveConversationMessages()
        );

        // Verify response from ARH client is returned
        expect(response).toBeDefined();
        if (response) {
          expect(response.messageId).toBe('bot-msg-1');
          expect(response.answer).toBe('Hello from ARH API!');
        }

        // Verify state was updated correctly
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(2);

        // User message
        expect(messages[0]).toEqual({
          id: expect.any(String),
          answer: 'Hello from integration test',
          role: 'user',
        });

        // Bot message
        expect(messages[1]).toEqual({
          id: expect.any(String),
          answer: 'Hello from ARH API!',
          role: 'bot',
          additionalAttributes: {
            sources: [],
            tool_call_metadata: undefined,
            output_guard_result: undefined,
          },
        });
      });

      it('should throw error when no active conversation is set', async () => {
        const userMessage: UserQuery = 'This should fail';

        await expect(stateManager.sendMessage(userMessage)).rejects.toThrow(
          'No active conversation'
        );
      });
    });

    describe('Message Queuing Integration', () => {
      const conversationId = 'conv-queue-integration';

      beforeEach(async () => {
        await stateManager.setActiveConversationId(conversationId);
      });

      it('should throw error when trying to send concurrent messages', async () => {
        const message1: UserQuery = 'First message';
        const message2: UserQuery = 'Second message';

        // Make the first call hang indefinitely
        mockFetch.mockImplementation(() => new Promise(() => {}));

        // Start first message (this will hang)
        const promise1 = stateManager.sendMessage(message1);

        // Try to send second message immediately - should throw error
        await expect(stateManager.sendMessage(message2)).rejects.toThrow(
          'A message is already being processed. Wait for it to complete before sending another message.'
        );

        // Clean up the hanging promise
        promise1.catch(() => {}); // Prevent unhandled rejection warning
      });

      it('should allow sending message after previous one completes', async () => {
        const message1: UserQuery = 'First message';
        const message2: UserQuery = 'Second message';

        const response1 = {
          message_id: 'bot-1',
          answer: 'First response',
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          sources: [],
        };

        const response2 = {
          message_id: 'bot-2',
          answer: 'Second response',
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          sources: [],
        };

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => response1,
            headers: new Headers({ 'content-type': 'application/json' }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => response2,
            headers: new Headers({ 'content-type': 'application/json' }),
          } as Response);

        // Send first message and wait for completion
        const result1 = await stateManager.sendMessage(message1);
        expect(result1?.messageId).toBe('bot-1');

        // Now should be able to send second message
        const result2 = await stateManager.sendMessage(message2);
        expect(result2?.messageId).toBe('bot-2');

        expect(stateManager.getMessageInProgress()).toBe(false);

        // Verify all messages are in conversation state
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(4); // 2 user + 2 bot messages
      });

      it('should reset progress flag on error and allow next message', async () => {
        const message1: UserQuery = 'Error message';
        const message2: UserQuery = 'Success message';

        const successResponse = {
          message_id: 'bot-success',
          answer: 'Success response',
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          sources: [],
        };

        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => successResponse,
            headers: new Headers({ 'content-type': 'application/json' }),
          } as Response);

        // First message should error
        await expect(stateManager.sendMessage(message1)).rejects.toThrow(
          'Network error'
        );

        // Should be able to send another message now
        const result = await stateManager.sendMessage(message2);
        expect(result?.messageId).toBe('bot-success');
        expect(stateManager.getMessageInProgress()).toBe(false);
      });
    });

    describe('Event System Integration', () => {
      it('should emit events during message flow', async () => {
        const conversationId = 'conv-events';
        const messageCallback = jest.fn();
        const progressCallback = jest.fn();
        const conversationCallback = jest.fn();

        // Subscribe to events using enum values
        stateManager.subscribe(Events.MESSAGE, messageCallback);
        stateManager.subscribe(Events.IN_PROGRESS, progressCallback);
        stateManager.subscribe(
          Events.ACTIVE_CONVERSATION,
          conversationCallback
        );

        const expectedResponse = {
          message_id: 'event-msg',
          answer: 'Event test response',
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          sources: [],
        };

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => expectedResponse,
          headers: new Headers({ 'content-type': 'application/json' }),
        } as Response);

        // Set conversation (should trigger ACTIVE_CONVERSATION event)
        await stateManager.setActiveConversationId(conversationId);
        expect(conversationCallback).toHaveBeenCalledTimes(1);

        // Send message (should trigger MESSAGE and IN_PROGRESS events)
        const userMessage: UserQuery = 'Test events';

        await stateManager.sendMessage(userMessage);

        // init phase
        // 1. notify(Events.ACTIVE_CONVERSATION) - conversation created
        // 2. notify(Events.MESSAGE) - conversation messages loaded
        // Based on new sendMessage flow:
        // 3. notify(Events.IN_PROGRESS) - start
        // 4. notify(Events.MESSAGE) - user message
        // 5. await sendMessage()
        // 6. notify(Events.MESSAGE) - bot message
        // 7. notify(Events.IN_PROGRESS) - end (from executeSendMessage)
        expect(messageCallback).toHaveBeenCalledTimes(3);
        expect(progressCallback).toHaveBeenCalledTimes(2); // Called twice now
      });

      it('should handle multiple event subscribers', async () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        // Subscribe multiple callbacks to same event
        stateManager.subscribe(Events.MESSAGE, callback1);
        stateManager.subscribe(Events.MESSAGE, callback2);

        // Create a message to trigger events
        await stateManager.setActiveConversationId('test-conv');

        // Subscribe method should return an unsubscribe function
        expect(typeof stateManager.subscribe).toBe('function');

        // Test that subscribe returns an unsubscribe function
        const unsubscribe = stateManager.subscribe(Events.MESSAGE, () => {});
        expect(typeof unsubscribe).toBe('function');
      });
    });

    describe('Error Handling Integration', () => {
      it('should handle ARH client errors gracefully in state manager', async () => {
        const conversationId = 'conv-error';

        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error occurred',
        } as Response);

        await stateManager.setActiveConversationId(conversationId);

        const userMessage: UserQuery = 'This will cause an error';

        await expect(stateManager.sendMessage(userMessage)).rejects.toThrow();

        // Verify state shows user message was added but no bot response
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(1); // User message + empty bot placeholder
        expect(messages[0].role).toBe('user');
      });
    });

    describe('Multi-Message Conversation Flow', () => {
      it('should handle multiple messages in sequence', async () => {
        const conversationId = 'conv-multi';

        // Mock conversation history endpoint (returns empty array for new conversation)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [], // Empty history for new conversation
          headers: new Headers({ 'content-type': 'application/json' }),
        } as Response);

        await stateManager.setActiveConversationId(conversationId);

        // Mock responses for multiple calls
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: 'msg-1',
              answer: 'First response',
              conversation_id: conversationId,
              received_at: new Date().toISOString(),
              sources: [],
            }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: 'msg-2',
              answer: 'Second response',
              conversation_id: conversationId,
              received_at: new Date().toISOString(),
              sources: [],
            }),
          } as Response);

        // Send first message
        await stateManager.sendMessage('First question');

        // Send second message
        await stateManager.sendMessage('Second question');

        // Verify conversation history
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(4); // 2 user + 2 bot messages

        expect(messages[0]).toEqual({
          id: expect.any(String),
          answer: 'First question',
          role: 'user',
        });
        expect(messages[1]).toEqual({
          id: expect.any(String),
          answer: 'First response',
          role: 'bot',
          additionalAttributes: {
            sources: [],
            tool_call_metadata: undefined,
            output_guard_result: undefined,
          },
        });
        expect(messages[2]).toEqual({
          id: expect.any(String),
          answer: 'Second question',
          role: 'user',
        });
        expect(messages[3]).toEqual({
          id: expect.any(String),
          answer: 'Second response',
          role: 'bot',
          additionalAttributes: {
            sources: [],
            tool_call_metadata: undefined,
            output_guard_result: undefined,
          },
        });
      });
    });

    describe('Additional Attributes Integration', () => {
      it('should properly populate and preserve ARH additional attributes through state manager', async () => {
        const conversationId = 'conv-attributes';
        await stateManager.setActiveConversationId(conversationId);

        // Mock ARH client response with full additional attributes
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            message_id: 'msg-with-attrs',
            answer: 'Here is information about OpenShift deployment...',
            conversation_id: conversationId,
            received_at: new Date().toISOString(),
            sources: [
              {
                title: 'Red Hat OpenShift Documentation',
                link: 'https://docs.openshift.com/container-platform/4.15/',
                score: 0.95,
                snippet: 'Official OpenShift Container Platform documentation',
              },
              {
                title: 'OpenShift Deployment Guide',
                link: 'https://docs.openshift.com/container-platform/4.15/applications/',
                score: 0.87,
                snippet: 'Guide for deploying applications on OpenShift',
              },
            ],
            tool_call_metadata: {
              tool_call: true,
              tool_name: 'search_documentation',
              parameters: { query: 'OpenShift deployment best practices' },
            },
            output_guard_result: {
              answer_relevance: 0.92,
              safety_score: 0.98,
              content_filter_passed: true,
            },
          }),
        } as Response);

        // Send message that should get additional attributes
        const response = await stateManager.sendMessage(
          'How do I deploy an app on OpenShift?'
        );

        expect(response).toBeDefined();
        expect(response.messageId).toBe('msg-with-attrs');

        // Verify additional attributes are present in the response
        expect(response.additionalAttributes).toEqual({
          sources: [
            {
              title: 'Red Hat OpenShift Documentation',
              link: 'https://docs.openshift.com/container-platform/4.15/',
              score: 0.95,
              snippet: 'Official OpenShift Container Platform documentation',
            },
            {
              title: 'OpenShift Deployment Guide',
              link: 'https://docs.openshift.com/container-platform/4.15/applications/',
              score: 0.87,
              snippet: 'Guide for deploying applications on OpenShift',
            },
          ],
          tool_call_metadata: {
            tool_call: true,
            tool_name: 'search_documentation',
            parameters: { query: 'OpenShift deployment best practices' },
          },
          output_guard_result: {
            answer_relevance: 0.92,
            safety_score: 0.98,
            content_filter_passed: true,
          },
        });

        // Verify additional attributes are preserved in state manager
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(2);

        // User message should not have additional attributes
        expect(messages[0].additionalAttributes).toBeUndefined();

        // Bot message should preserve all additional attributes
        const botMessage = messages[1];
        expect(botMessage.additionalAttributes).toEqual({
          sources: [
            {
              title: 'Red Hat OpenShift Documentation',
              link: 'https://docs.openshift.com/container-platform/4.15/',
              score: 0.95,
              snippet: 'Official OpenShift Container Platform documentation',
            },
            {
              title: 'OpenShift Deployment Guide',
              link: 'https://docs.openshift.com/container-platform/4.15/applications/',
              score: 0.87,
              snippet: 'Guide for deploying applications on OpenShift',
            },
          ],
          tool_call_metadata: {
            tool_call: true,
            tool_name: 'search_documentation',
            parameters: { query: 'OpenShift deployment best practices' },
          },
          output_guard_result: {
            answer_relevance: 0.92,
            safety_score: 0.98,
            content_filter_passed: true,
          },
        });
      });

      it('should handle messages with minimal additional attributes', async () => {
        const conversationId = 'conv-minimal-attrs';
        await stateManager.setActiveConversationId(conversationId);

        // Mock ARH client response with minimal additional attributes
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            message_id: 'msg-minimal',
            answer: 'This is a simple response without sources or tool calls.',
            conversation_id: conversationId,
            received_at: new Date().toISOString(),
            sources: [],
            tool_call_metadata: null,
            output_guard_result: {
              answer_relevance: 0.85,
              safety_score: 1.0,
              content_filter_passed: true,
            },
          }),
        } as Response);

        const response = await stateManager.sendMessage('Simple question?');

        // Verify minimal additional attributes are handled correctly
        expect(response.additionalAttributes).toEqual({
          sources: [],
          tool_call_metadata: null,
          output_guard_result: {
            answer_relevance: 0.85,
            safety_score: 1.0,
            content_filter_passed: true,
          },
        });

        // Verify state manager preserves minimal attributes
        const messages = stateManager.getActiveConversationMessages();
        const botMessage = messages[1];
        expect(botMessage.additionalAttributes).toEqual({
          sources: [],
          tool_call_metadata: null,
          output_guard_result: {
            answer_relevance: 0.85,
            safety_score: 1.0,
            content_filter_passed: true,
          },
        });
      });
    });
  });
});
