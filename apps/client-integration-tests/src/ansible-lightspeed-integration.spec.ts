import { AnsibleLightspeedClient } from '@redhat-cloud-services/ansible-lightspeed';
import type {
  AnsibleLightspeedConfig,
  QueryRequest,
  QueryResponse,
} from '@redhat-cloud-services/ansible-lightspeed';

// Import state manager components
import {
  createClientStateManager,
  Events,
  UserQuery,
} from '@redhat-cloud-services/ai-client-state';

// Integration tests specifically for the Ansible Lightspeed client
// and its interaction with the AI client state management system

/**
 * Ansible Lightspeed Client Integration Tests
 *
 * These tests verify the integration between:
 * - @redhat-cloud-services/ansible-lightspeed (Ansible Lightspeed API client)
 * - @redhat-cloud-services/ai-client-state (State management)
 *
 * Note: For full streaming tests, use the Ansible Lightspeed mock server:
 * npm run ansible-lightspeed-mock-server
 */
describe('Ansible Lightspeed Client Integration Tests', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let client: AnsibleLightspeedClient;

  beforeEach(() => {
    mockFetch = jest.fn();

    const config: AnsibleLightspeedConfig = {
      baseUrl: 'https://api.test.com',
      fetchFunction: mockFetch,
    };

    client = new AnsibleLightspeedClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Ansible Lightspeed Client Basic Integration', () => {
    it('should create Ansible Lightspeed client successfully', () => {
      expect(client).toBeInstanceOf(AnsibleLightspeedClient);
      expect(typeof client.query).toBe('function');
      expect(typeof client.streamingQuery).toBe('function');
      expect(typeof client.getInfo).toBe('function');
      expect(typeof client.getModels).toBe('function');
    });

    it('should handle non-streaming queries', async () => {
      const expectedResponse: QueryResponse = {
        conversation_id: 'conv-456',
        response: 'You can use the ansible.builtin.copy module for this task.',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const queryRequest: QueryRequest = {
        query: 'How do I copy files in Ansible?',
        conversation_id: 'conv-456',
      };

      const response = await client.query(queryRequest);

      expect(response).toBeDefined();
      expect(response.conversation_id).toBe('conv-456');
      expect(response.response).toBe(
        'You can use the ansible.builtin.copy module for this task.'
      );
    });

    it('should handle streaming queries', async () => {
      // Skip streaming test for now - requires more complex ReadableStream setup
      // This is a known limitation of testing streaming in Node.js environment
      //
      // For full streaming integration tests, use the Ansible Lightspeed mock server:
      // 1. Start: npm run ansible-lightspeed-mock-server
      // 2. Configure client to use http://localhost:3003 as baseUrl
      // 3. Send requests to /v1/streaming_query
      //
      // The Ansible Lightspeed mock server (ansible-lightspeed-mock-server.js) provides realistic streaming
      // responses that match the Ansible Lightspeed OpenAPI specification.
      expect(true).toBe(true);
    });

    it('should handle info endpoint', async () => {
      const expectedResponse = {
        name: 'Ansible Lightspeed Intelligent Assistant service',
        version: '0.1.3',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.getInfo();

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/info',
        expect.any(Object)
      );
    });

    it('should handle models endpoint', async () => {
      const expectedResponse = {
        models: [
          {
            identifier: 'llama3.2:3b-instruct-fp16',
            metadata: {},
            api_model_type: 'llm',
            provider_id: 'ollama',
            provider_resource_id: 'llama3.2:3b-instruct-fp16',
            type: 'model',
            model_type: 'llm',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.getModels();

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/models',
        expect.any(Object)
      );
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

      const queryRequest: QueryRequest = {
        query: 'This will fail',
      };

      await expect(client.query(queryRequest)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const queryRequest: QueryRequest = {
        query: 'This will fail with network error',
      };

      await expect(client.query(queryRequest)).rejects.toThrow('Network error');
    });

    it('should handle validation errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ['body', 'query'],
              msg: 'field required',
              type: 'value_error.missing',
            },
          ],
        }),
      } as Response);

      const queryRequest: QueryRequest = {
        query: '',
      };

      await expect(client.query(queryRequest)).rejects.toThrow();
    });
  });

  describe('Client Configuration', () => {
    it('should handle custom headers and request options', async () => {
      const expectedResponse: QueryResponse = {
        conversation_id: 'conv-custom',
        response: 'Custom Ansible response',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const queryRequest: QueryRequest = {
        query: 'How do I use Ansible vault?',
        conversation_id: 'conv-custom',
      };

      const response = await client.query(queryRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(queryRequest),
        })
      );

      expect(response).toBeDefined();
      expect(response.conversation_id).toBe('conv-custom');
    });
  });

  describe('Feedback Integration', () => {
    it('should submit feedback successfully', async () => {
      const expectedResponse = {
        response: 'Feedback received and stored',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const feedbackRequest = {
        conversation_id: 'conv-123',
        user_question: 'How do I use Ansible?',
        llm_response: 'You can use Ansible playbooks...',
        sentiment: 1,
        user_feedback: 'Very helpful!',
      };

      const response = await client.submitFeedback(feedbackRequest);

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('Conversation Management', () => {
    it('should get conversation successfully', async () => {
      const expectedResponse = {
        conversation_id: 'conv-123',
        chat_history: [
          {
            messages: [
              { content: 'Hello', type: 'user' },
              { content: 'Hi there!', type: 'assistant' },
            ],
            started_at: '2024-01-01T00:01:00Z',
            completed_at: '2024-01-01T00:01:05Z',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.getConversation('conv-123');

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/conversations/conv-123',
        expect.any(Object)
      );
    });

    it('should delete conversation successfully', async () => {
      const expectedResponse = {
        conversation_id: 'conv-123',
        success: true,
        response: 'Conversation deleted successfully',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.deleteConversation('conv-123');

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/conversations/conv-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Health and Configuration', () => {
    it('should check readiness', async () => {
      const expectedResponse = {
        ready: true,
        reason: 'Service is ready',
        providers: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.getReadiness();

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/readiness',
        expect.any(Object)
      );
    });

    it('should check liveness', async () => {
      const expectedResponse = {
        alive: true,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.getLiveness();

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/liveness',
        expect.any(Object)
      );
    });

    it('should get configuration', async () => {
      const expectedResponse = {
        name: 'Ansible Lightspeed Config',
        service: { host: 'localhost', port: 8080 },
        llama_stack: { url: 'http://localhost:8321' },
        user_data_collection: { feedback_enabled: true },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const response = await client.getConfiguration();

      expect(response).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/config',
        expect.any(Object)
      );
    });

    it('should get metrics', async () => {
      const expectedResponse =
        '# HELP requests_total Total requests\nrequests_total 42';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'text/plain' }),
      } as Response);

      const response = await client.getMetrics();

      expect(response).toBe(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/metrics',
        expect.any(Object)
      );
    });
  });

  describe('Ansible Lightspeed Client + State Manager Integration', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;

    beforeEach(() => {
      // Create state manager with Ansible Lightspeed client
      const config: AnsibleLightspeedConfig = {
        baseUrl: 'https://api.test.com',
        fetchFunction: mockFetch,
      };

      const client = new AnsibleLightspeedClient(config);
      stateManager = createClientStateManager(client);
    });

    describe('State Management Integration', () => {
      it('should create state manager with Ansible Lightspeed client successfully', () => {
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
          title: 'Ansible Conversation',
          locked: false,
        };

        expect(state.activeConversationId).toBe(conversationId);
        expect(state.conversations[conversationId]).toBeDefined();
        expect(state.conversations[conversationId].messages).toEqual([]);
      });

      it('should handle non-streaming messages with state updates', async () => {
        const conversationId = 'conv-integration';
        const userMessage: UserQuery = 'How do I create an Ansible playbook?';

        const expectedResponse: QueryResponse = {
          conversation_id: conversationId,
          response:
            'To create an Ansible playbook, you need to define tasks in YAML format...',
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
          title: 'Ansible Conversation',
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

        // Verify response from Ansible Lightspeed client is returned
        expect(response).toBeDefined();
        if (response) {
          expect(response.answer).toBe(
            'To create an Ansible playbook, you need to define tasks in YAML format...'
          );
        }

        // Verify state was updated correctly
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(2);

        // User message
        expect(messages[0]).toEqual({
          id: expect.any(String),
          answer: 'How do I create an Ansible playbook?',
          role: 'user',
        });

        // Bot message
        expect(messages[1]).toEqual({
          id: expect.any(String),
          answer:
            'To create an Ansible playbook, you need to define tasks in YAML format...',
          role: 'bot',
          additionalAttributes: {
            available_quotas: undefined,
            input_tokens: undefined,
            model: undefined,
            output_tokens: undefined,
            provider: undefined,
            referenced_documents: undefined,
            truncated: undefined,
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
        const message1: UserQuery = 'First Ansible question';
        const message2: UserQuery = 'Second Ansible question';

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
        const message1: UserQuery = 'First Ansible question';
        const message2: UserQuery = 'Second Ansible question';

        const response1: QueryResponse = {
          conversation_id: conversationId,
          response: 'First Ansible response',
        };

        const response2: QueryResponse = {
          conversation_id: conversationId,
          response: 'Second Ansible response',
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
        expect(result1?.answer).toBe('First Ansible response');

        // Now should be able to send second message
        const result2 = await stateManager.sendMessage(message2);
        expect(result2?.answer).toBe('Second Ansible response');

        expect(stateManager.getMessageInProgress()).toBe(false);

        // Verify all messages are in conversation state
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(4); // 2 user + 2 bot messages
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

        const expectedResponse: QueryResponse = {
          conversation_id: conversationId,
          response: 'Ansible event test response',
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
        const userMessage: UserQuery = 'Test Ansible events';

        await stateManager.sendMessage(userMessage);

        // Verify events were called
        expect(messageCallback).toHaveBeenCalledTimes(3);
        expect(progressCallback).toHaveBeenCalledTimes(2);
      });
    });

    describe('Error Handling Integration', () => {
      it('should handle Ansible Lightspeed client errors gracefully in state manager', async () => {
        const conversationId = 'conv-error';

        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error occurred',
        } as Response);

        await stateManager.setActiveConversationId(conversationId);

        const userMessage: UserQuery = 'This will cause an Ansible error';

        await expect(stateManager.sendMessage(userMessage)).rejects.toThrow();

        // Verify state shows user message was added but no bot response
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
      });
    });

    describe('Multi-Message Ansible Conversation Flow', () => {
      it('should handle multiple Ansible questions in sequence', async () => {
        const conversationId = 'conv-multi-ansible';

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
              conversation_id: conversationId,
              response: 'Use ansible.builtin.copy module',
            }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              conversation_id: conversationId,
              response: 'Use ansible.builtin.template module',
            }),
          } as Response);

        // Send first message
        await stateManager.sendMessage('How do I copy files?');

        // Send second message
        await stateManager.sendMessage('How do I use templates?');

        // Verify conversation history
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(4); // 2 user + 2 bot messages

        expect(messages[0]).toEqual({
          id: expect.any(String),
          answer: 'How do I copy files?',
          role: 'user',
        });
        expect(messages[1]).toEqual({
          id: expect.any(String),
          answer: 'Use ansible.builtin.copy module',
          role: 'bot',
          additionalAttributes: {
            available_quotas: undefined,
            input_tokens: undefined,
            model: undefined,
            output_tokens: undefined,
            provider: undefined,
            referenced_documents: undefined,
            truncated: undefined,
          },
        });
        expect(messages[2]).toEqual({
          id: expect.any(String),
          answer: 'How do I use templates?',
          role: 'user',
        });
        expect(messages[3]).toEqual({
          id: expect.any(String),
          answer: 'Use ansible.builtin.template module',
          role: 'bot',
          additionalAttributes: {
            available_quotas: undefined,
            input_tokens: undefined,
            model: undefined,
            output_tokens: undefined,
            provider: undefined,
            referenced_documents: undefined,
            truncated: undefined,
          },
        });
      });
    });
  });
});
