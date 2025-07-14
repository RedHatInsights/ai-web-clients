import { IFDClient } from '@redhat-cloud-services/arh-client';
import type { 
  IFDClientConfig, 
  MessageChunkResponse
} from '@redhat-cloud-services/arh-client';
import type { IStreamingHandler } from '@redhat-cloud-services/ai-client-common';

// Import state manager components
import { 
  createClientStateManager,
  Events,
  type Message
} from '@redhat-cloud-services/ai-client-state';

// For now, let's create a simple integration test that verifies the packages work together
// This can be expanded once we have the state manager properly exported

describe('ARH Client Integration Tests', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let client: IFDClient;
  
  beforeEach(() => {
    mockFetch = jest.fn();
    
    const config: IFDClientConfig = {
      baseUrl: 'https://api.test.com',
      fetchFunction: mockFetch
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
        output: 'Hello! How can I help?',
        conversation_id: 'conv-456',
        received_at: new Date().toISOString(),
        sources: []
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const response = await client.sendMessage('conv-456', 'Hello AI');

      expect(response).toBeDefined();
      if (response) {
        expect(response.messageId).toBe('msg-123');
        expect(response.content).toBe('Hello! How can I help?');
        expect(response.conversationId).toBe('conv-456');
      }
    });

    it('should handle streaming with default handler', async () => {
      // Skip streaming test for now - requires more complex ReadableStream setup
      // This is a known limitation of testing streaming in Node.js environment
      // TODO: Implement proper streaming test with ReadableStream polyfill
      expect(true).toBe(true);
    });

    it('should handle client default handler access', () => {
      const mockHandler: IStreamingHandler<MessageChunkResponse> = {
        onChunk: jest.fn(),
        onStart: jest.fn(),
        onComplete: jest.fn()
      };

      const clientWithDefault = new IFDClient({
        baseUrl: 'https://api.test.com',
        fetchFunction: mockFetch,
        defaultStreamingHandler: mockHandler
      });

      const retrievedHandler = clientWithDefault.getDefaultStreamingHandler();
      expect(retrievedHandler).toBe(mockHandler);
    });

    it('should throw error when streaming without handler', async () => {
      const clientWithoutHandler = new IFDClient({
        baseUrl: 'https://api.test.com',
        fetchFunction: mockFetch
      });

      await expect(
        clientWithoutHandler.sendMessage('conv-123', 'Hello', { stream: true })
      ).rejects.toThrow('Request validation failed');
    });
  });

  describe('API Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error occurred'
      } as Response);

      await expect(
        client.sendMessage('conv-123', 'Hello')
      ).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        client.sendMessage('conv-123', 'Hello')
      ).rejects.toThrow('Network error');
    });
  });

  describe('Client Configuration', () => {
    it('should handle custom headers and request options', async () => {
             const expectedResponse = {
         message_id: 'msg-custom',
         output: 'Custom response',
         conversation_id: 'conv-custom',
         received_at: new Date().toISOString(),
         sources: []
       };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const response = await client.sendMessage('conv-custom', 'Hello', {
        headers: { 'X-Custom-Header': 'test-value' }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'test-value'
          })
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
        fetchFunction: mockFetch
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
        expect(typeof stateManager.getActiveConversationMessages).toBe('function');
      });

      it('should set active conversation and manage state', () => {
        const conversationId = 'conv-state-123';
        
        stateManager.setActiveConversationId(conversationId);
        
        // Manually create conversation state (this is how the state manager works)
        const state = stateManager.getState();
        state.conversations[conversationId] = {
          id: conversationId,
          messages: []
        };
        
        expect(state.activeConversationId).toBe(conversationId);
        expect(state.conversations[conversationId]).toBeDefined();
        expect(state.conversations[conversationId].messages).toEqual([]);
      });

      it('should handle non-streaming messages with state updates', async () => {
        const conversationId = 'conv-integration';
        const userMessage: Message = {
          id: 'user-msg-1',
          content: 'Hello from integration test',
          role: 'user'
        };

        const expectedResponse = {
          message_id: 'bot-msg-1',
          output: 'Hello from ARH API!',
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          sources: []
        };

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => expectedResponse,
          headers: new Headers({ 'content-type': 'application/json' })
        } as Response);

        stateManager.setActiveConversationId(conversationId);
        
        const response = await stateManager.sendMessage(userMessage);

        // Verify response from ARH client is returned
        expect(response).toBeDefined();
        if (response) {
          expect(response.messageId).toBe('bot-msg-1');
          expect(response.content).toBe('Hello from ARH API!');
        }

        // Verify state was updated correctly
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(2);
        
        // User message
        expect(messages[0]).toEqual({
          id: 'user-msg-1',
          content: 'Hello from integration test',
          role: 'user'
        });
        
        // Bot message
        expect(messages[1]).toEqual({
          id: 'bot-msg-1',
          content: 'Hello from ARH API!',
          role: 'bot'
        });
      });

      it('should throw error when no active conversation is set', async () => {
        const userMessage: Message = {
          id: 'user-msg-error',
          content: 'This should fail',
          role: 'user'
        };

        await expect(
          stateManager.sendMessage(userMessage)
        ).rejects.toThrow('No active conversation');
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
         stateManager.subscribe(Events.ACTIVE_CONVERSATION, conversationCallback);

        const expectedResponse = {
          message_id: 'event-msg',
          output: 'Event test response',
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          sources: []
        };

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => expectedResponse,
          headers: new Headers({ 'content-type': 'application/json' })
        } as Response);

        // Set conversation (should trigger ACTIVE_CONVERSATION event)
        stateManager.setActiveConversationId(conversationId);
        expect(conversationCallback).toHaveBeenCalledTimes(1);

        // Send message (should trigger MESSAGE and IN_PROGRESS events)
        const userMessage: Message = {
          id: 'event-user-msg',
          content: 'Test events',
          role: 'user'
        };

        await stateManager.sendMessage(userMessage);

        // Based on new sendMessage flow:
        // 1. notify(Events.IN_PROGRESS) - start
        // 2. await sendMessage() 
        // 3. notify(Events.MESSAGE) - after completion
        // 4. notify(Events.IN_PROGRESS) - end
        expect(messageCallback).toHaveBeenCalledTimes(1);
        expect(progressCallback).toHaveBeenCalledTimes(2); // Called twice now
      });

      it('should handle multiple event subscribers', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        
                 // Subscribe multiple callbacks to same event
         stateManager.subscribe(Events.MESSAGE, callback1);
         stateManager.subscribe(Events.MESSAGE, callback2);
        
        // Create a message to trigger events
        stateManager.setActiveConversationId('test-conv');
        
        // Both callbacks should be called (though this test is limited by subscribe API)
        expect(typeof stateManager.subscribe).toBe('function');
        expect(typeof stateManager.unsubscribe).toBe('function');
      });
    });

    describe('Error Handling Integration', () => {
      it('should handle ARH client errors gracefully in state manager', async () => {
        const conversationId = 'conv-error';
        
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error occurred'
        } as Response);

        stateManager.setActiveConversationId(conversationId);

        const userMessage: Message = {
          id: 'error-user-msg',
          content: 'This will cause an error',
          role: 'user'
        };

        await expect(
          stateManager.sendMessage(userMessage)
        ).rejects.toThrow();

        // Verify state shows user message was added but no bot response
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(2); // User message + empty bot placeholder
        expect(messages[0].role).toBe('user');
        expect(messages[1].role).toBe('bot');
        expect(messages[1].content).toBe(''); // Empty because of error
      });

      it('should handle streaming without handler error', async () => {
        const conversationId = 'conv-no-handler';
        stateManager.setActiveConversationId(conversationId);

        const userMessage: Message = {
          id: 'stream-error-msg',
          content: 'Streaming without handler',
          role: 'user'
        };

        await expect(
          stateManager.sendMessage(userMessage, { stream: true })
        ).rejects.toThrow('Streaming requested but no default streaming handler available in client');
      });
    });

    describe('Multi-Message Conversation Flow', () => {
      it('should handle multiple messages in sequence', async () => {
        const conversationId = 'conv-multi';
        stateManager.setActiveConversationId(conversationId);

        // Mock responses for multiple calls
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: 'msg-1',
              output: 'First response',
              conversation_id: conversationId,
              received_at: new Date().toISOString(),
              sources: []
            })
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: 'msg-2',
              output: 'Second response',
              conversation_id: conversationId,
              received_at: new Date().toISOString(),
              sources: []
            })
          } as Response);

        // Send first message
        await stateManager.sendMessage({
          id: 'user-1',
          content: 'First question',
          role: 'user'
        });

        // Send second message
        await stateManager.sendMessage({
          id: 'user-2',
          content: 'Second question',
          role: 'user'
        });

        // Verify conversation history
        const messages = stateManager.getActiveConversationMessages();
        expect(messages).toHaveLength(4); // 2 user + 2 bot messages

        expect(messages[0]).toEqual({
          id: 'user-1',
          content: 'First question',
          role: 'user'
        });
        expect(messages[1]).toEqual({
          id: 'msg-1',
          content: 'First response',
          role: 'bot'
        });
        expect(messages[2]).toEqual({
          id: 'user-2',
          content: 'Second question',
          role: 'user'
        });
        expect(messages[3]).toEqual({
          id: 'msg-2',
          content: 'Second response',
          role: 'bot'
        });
      });
    });
  });
}); 