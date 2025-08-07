import { AnsibleLightspeedClient } from '@redhat-cloud-services/ansible-lightspeed-client';
import type {
  AnsibleLightspeedConfig,
  QueryRequest,
} from '@redhat-cloud-services/ansible-lightspeed-client';
import { processStreamWithHandler } from '@redhat-cloud-services/ansible-lightspeed-client';

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
 * - @redhat-cloud-services/ansible-lightspeed-client (Ansible Lightspeed API client)
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
      baseUrl: 'https://ansible-api.test.com',
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
      const expectedResponse = {
        conversation_id: 'conv-ansible-123',
        response: 'You can use the ansible.builtin.copy module for this task.',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const queryRequest: QueryRequest = {
        query: 'How do I copy files with Ansible?',
        conversation_id: 'conv-ansible-123',
      };

      const response = await client.query(queryRequest);

      expect(response).toBeDefined();
      expect(response.conversation_id).toBe('conv-ansible-123');
      expect(response.response).toContain('ansible.builtin.copy');
    });

    it('should handle service info endpoint', async () => {
      const expectedInfo = {
        name: 'Ansible Lightspeed Intelligent Assistant service',
        version: '0.1.3',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedInfo,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const info = await client.getInfo();

      expect(info).toBeDefined();
      expect(info.name).toBe(
        'Ansible Lightspeed Intelligent Assistant service'
      );
      expect(info.version).toBe('0.1.3');
    });

    it('should handle models endpoint', async () => {
      const expectedModels = {
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
        json: async () => expectedModels,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const models = await client.getModels();

      expect(models).toBeDefined();
      expect(models.models).toHaveLength(1);
      expect(models.models[0].identifier).toBe('llama3.2:3b-instruct-fp16');
    });

    it('should handle feedback submission', async () => {
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
        conversation_id: 'conv-feedback-123',
        user_question: 'How do I deploy apps with Ansible?',
        llm_response: 'Use ansible.builtin.service module.',
        sentiment: 1,
        user_feedback: 'Very helpful response!',
      };

      const response = await client.submitFeedback(feedbackRequest);

      expect(response).toBeDefined();
      expect(response.response).toBe('Feedback received and stored');
    });

    it('should handle conversation retrieval', async () => {
      const expectedConversation = {
        conversation_id: 'conv-retrieve-123',
        chat_history: [
          {
            messages: [
              { content: 'How do I install packages?', type: 'user' },
              {
                content: 'Use ansible.builtin.package module.',
                type: 'assistant',
              },
            ],
            started_at: '2024-01-01T00:00:00Z',
            completed_at: '2024-01-01T00:00:05Z',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedConversation,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const conversation = await client.getConversation('conv-retrieve-123');

      expect(conversation).toBeDefined();
      expect(conversation.conversation_id).toBe('conv-retrieve-123');
      expect(conversation.chat_history).toHaveLength(1);
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
        query: 'This will cause an error',
      };

      await expect(client.query(queryRequest)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const queryRequest: QueryRequest = {
        query: 'Network failure test',
      };

      await expect(client.query(queryRequest)).rejects.toThrow('Network error');
    });

    it('should handle validation errors', async () => {
      const validationError = {
        detail: [
          {
            loc: ['body', 'query'],
            msg: 'field required',
            type: 'value_error.missing',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => validationError,
      } as Response);

      const queryRequest: QueryRequest = {
        query: '',
      };

      await expect(client.query(queryRequest)).rejects.toThrow();
    });
  });

  describe('Health and Status Endpoints', () => {
    it('should check service readiness', async () => {
      const expectedReadiness = {
        ready: true,
        reason: 'Service is ready',
        providers: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedReadiness,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const readiness = await client.getReadiness();

      expect(readiness).toBeDefined();
      expect(readiness.ready).toBe(true);
      expect(readiness.reason).toBe('Service is ready');
    });

    it('should check service liveness', async () => {
      const expectedLiveness = {
        alive: true,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedLiveness,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const liveness = await client.getLiveness();

      expect(liveness).toBeDefined();
      expect(liveness.alive).toBe(true);
    });

    it('should get service configuration', async () => {
      const expectedConfig = {
        name: 'Ansible Lightspeed Mock Config',
        service: {
          host: 'localhost',
          port: 3003,
          auth_enabled: false,
        },
        llama_stack: {
          url: 'http://localhost:8321',
          api_key: 'mock-key',
        },
        user_data_collection: {
          feedback_enabled: true,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedConfig,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      const config = await client.getConfiguration();

      expect(config).toBeDefined();
      expect(config.name).toBe('Ansible Lightspeed Mock Config');
      expect(config.service).toBeDefined();
    });
  });

  describe('Streaming Integration', () => {
    it('should handle streaming query with mock response', async () => {
      // Skip actual streaming test in Jest - requires more complex ReadableStream setup
      // This test validates the streaming method exists and can be called
      //
      // For full streaming integration tests, use the Ansible Lightspeed mock server:
      // 1. Start: npm run ansible-lightspeed-mock-server
      // 2. Configure client to use http://localhost:3003 as baseUrl
      // 3. Send requests to /v1/streaming_query
      //
      // The mock server provides realistic streaming responses with events:
      // - start: { conversation_id }
      // - token: { id, role, token }
      // - turn_complete: { id, token }
      // - end: { referenced_documents, input_tokens, output_tokens }

      expect(typeof client.streamingQuery).toBe('function');
      expect(typeof processStreamWithHandler).toBe('function');
    });
  });

  describe('Ansible Lightspeed Client + State Manager Integration', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;

    beforeEach(() => {
      // Create state manager with Ansible Lightspeed client
      const config: AnsibleLightspeedConfig = {
        baseUrl: 'https://ansible-api.test.com',
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

      it('should handle non-streaming messages with state updates', async () => {
        const conversationId = 'conv-ansible-integration';
        const userMessage: UserQuery = 'How do I manage services with Ansible?';

        const expectedResponse = {
          conversation_id: conversationId,
          response:
            'Use the ansible.builtin.service module to manage services.',
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

        // Manually create conversation state
        const state = stateManager.getState();
        state.conversations[conversationId] = {
          id: conversationId,
          title: 'Ansible Conversation',
          messages: [],
          locked: false,
        };

        await stateManager.setActiveConversationId(conversationId);

        const response = await stateManager.sendMessage(userMessage);

        // Verify response from Ansible Lightspeed client is returned
        expect(response).toBeDefined();
        if (response) {
          expect(response.answer).toBe(
            'Use the ansible.builtin.service module to manage services.'
          );
        }

        // Verify state was updated correctly
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(2);

        // User message
        expect(messages[0]).toEqual({
          id: expect.any(String),
          answer: 'How do I manage services with Ansible?',
          role: 'user',
        });

        // Bot message
        expect(messages[1]).toEqual({
          id: expect.any(String),
          answer: 'Use the ansible.builtin.service module to manage services.',
          role: 'bot',
          additionalAttributes: undefined,
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
      const conversationId = 'conv-ansible-queue';

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

        const response1 = {
          conversation_id: conversationId,
          response: 'First Ansible response',
        };

        const response2 = {
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
        const conversationId = 'conv-ansible-events';
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

        // Verify events were emitted
        expect(messageCallback).toHaveBeenCalledTimes(3);
        expect(progressCallback).toHaveBeenCalledTimes(2);
      });
    });

    describe('Error Handling Integration', () => {
      it('should handle Ansible Lightspeed client errors gracefully in state manager', async () => {
        const conversationId = 'conv-ansible-error';

        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Ansible service error occurred',
        } as Response);

        await stateManager.setActiveConversationId(conversationId);

        const userMessage: UserQuery = 'This will cause an Ansible error';

        await expect(stateManager.sendMessage(userMessage)).rejects.toThrow();

        // Verify state shows user message was added but no bot response
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(1); // User message only
        expect(messages[0].role).toBe('user');
      });
    });

    describe('Multi-Message Conversation Flow', () => {
      it('should handle multiple Ansible messages in sequence', async () => {
        const conversationId = 'conv-ansible-multi';

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
              response: 'Use ansible.builtin.copy for file operations',
            }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              conversation_id: conversationId,
              response: 'Use ansible.builtin.service for service management',
            }),
          } as Response);

        // Send first message
        await stateManager.sendMessage('How do I copy files?');

        // Send second message
        await stateManager.sendMessage('How do I manage services?');

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
          answer: 'Use ansible.builtin.copy for file operations',
          role: 'bot',
          additionalAttributes: undefined,
        });
        expect(messages[2]).toEqual({
          id: expect.any(String),
          answer: 'How do I manage services?',
          role: 'user',
        });
        expect(messages[3]).toEqual({
          id: expect.any(String),
          answer: 'Use ansible.builtin.service for service management',
          role: 'bot',
          additionalAttributes: undefined,
        });
      });
    });
  });
});
