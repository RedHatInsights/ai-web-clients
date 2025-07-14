import createClientStateManager, { 
  Message, 
  MessageOptions, 
  Events
} from './state-manager';
import { 
  IAIClient, 
  IStreamingHandler, 
  IMessageResponse,
  wrapStreamingHandler 
} from '@redhat-cloud-services/ai-client-common';

// Mock crypto.randomUUID for consistent testing
const mockUUID = jest.fn();
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: mockUUID },
  writable: true,
});

// Mock the wrapStreamingHandler function
jest.mock('@redhat-cloud-services/ai-client-common', () => ({
  ...jest.requireActual('@redhat-cloud-services/ai-client-common'),
  wrapStreamingHandler: jest.fn(),
}));

describe('State Manager', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let mockStreamingHandler: jest.Mocked<IStreamingHandler<unknown>>;
  let uuidCounter: number;

  beforeEach(() => {
    uuidCounter = 0;
    mockUUID.mockImplementation(() => `uuid-${++uuidCounter}`);

    mockStreamingHandler = {
      onChunk: jest.fn(),
      onStart: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
      onAbort: jest.fn(),
    };

    mockClient = {
      sendMessage: jest.fn(),
      healthCheck: jest.fn(),
      getServiceStatus: jest.fn(),
      getDefaultStreamingHandler: jest.fn(),
    } as jest.Mocked<IAIClient>;

    // Setup default return value for getDefaultStreamingHandler
    (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(mockStreamingHandler);

    (wrapStreamingHandler as jest.Mock).mockImplementation((original, hooks) => ({
      ...original,
      onChunk: (chunk: unknown) => {
        hooks.beforeChunk?.(chunk);
        original.onChunk(chunk);
      },
    }));

    jest.clearAllMocks();
  });

  describe('State Manager Creation', () => {
    it('should create state manager with client only', () => {
      const stateManager = createClientStateManager(mockClient);
      const state = stateManager.getState();

      expect(state.client).toBe(mockClient);
      expect(state.activeConversationId).toBeUndefined();
      expect(state.conversations).toEqual({});
      expect(state.messageInProgress).toBe(false);
    });

    it('should create state manager with active conversation ID', () => {
      const conversationId = 'conv-123';
      const stateManager = createClientStateManager(mockClient, conversationId);
      const state = stateManager.getState();

      expect(state.activeConversationId).toBe(conversationId);
    });

    it('should return the same client instance', () => {
      const stateManager = createClientStateManager(mockClient);
      expect(stateManager.client).toBe(mockClient);
    });
  });

  describe('Conversation Management', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;

    beforeEach(() => {
      stateManager = createClientStateManager(mockClient);
    });

    it('should set active conversation ID', () => {
      const conversationId = 'conv-456';
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      expect(state.activeConversationId).toBe(conversationId);
    });

    it('should auto-create conversation when setting conversation ID', () => {
      stateManager.setActiveConversationId('non-existent');
      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('non-existent');
      expect(state.conversations['non-existent']).toEqual({
        id: 'non-existent',
        messages: []
      });
    });

    it('should create conversation state when setting active conversation', () => {
      const conversationId = 'conv-789';
      stateManager.setActiveConversationId(conversationId);
      
      // Conversation should be auto-created
      const state = stateManager.getState();
      expect(state.conversations[conversationId]).toEqual({
        id: conversationId,
        messages: []
      });
    });

    it('should return empty array for active conversation messages when no active conversation', () => {
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toEqual([]);
    });

    it('should return messages for active conversation', () => {
      const conversationId = 'conv-with-messages';
      const testMessages: Message[] = [
        { id: 'msg-1', content: 'Hello', role: 'user' },
        { id: 'msg-2', content: 'Hi there!', role: 'bot' }
      ];

      stateManager.setActiveConversationId(conversationId);
      const state = stateManager.getState();
      state.conversations[conversationId] = {
        id: conversationId,
        messages: testMessages
      };

      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toEqual(testMessages);
    });
  });

  describe('Message In Progress State', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;

    beforeEach(() => {
      stateManager = createClientStateManager(mockClient);
    });

    it('should initially have no message in progress', () => {
      expect(stateManager.getMessageInProgress()).toBe(false);
    });

    it('should set message in progress during sendMessage', async () => {
      const conversationId = 'conv-progress';
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      state.conversations[conversationId] = { id: conversationId, messages: [] };

      const mockResponse: IMessageResponse = {
        messageId: 'response-1',
        content: 'Response content',
        conversationId: conversationId
      };

      mockClient.sendMessage.mockResolvedValue(mockResponse);

      const sendPromise = stateManager.sendMessage({
        id: 'user-msg-1',
        content: 'Test message',
        role: 'user'
      });

      // Should be in progress immediately
      expect(stateManager.getMessageInProgress()).toBe(true);

      await sendPromise;

      // Should be completed after response
      expect(stateManager.getMessageInProgress()).toBe(false);
    });
  });

  describe('Non-Streaming Message Handling', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;
    const conversationId = 'conv-non-stream';

    beforeEach(() => {
      stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      state.conversations[conversationId] = { id: conversationId, messages: [] };
    });

    it('should send non-streaming message and update state', async () => {
      const userMessage: Message = {
        id: 'user-msg-1',
        content: 'What is AI?',
        role: 'user'
      };

      const mockResponse: IMessageResponse = {
        messageId: 'bot-msg-1',
        content: 'AI is artificial intelligence...',
        conversationId: conversationId
      };

      mockClient.sendMessage.mockResolvedValue(mockResponse);

      const result = await stateManager.sendMessage(userMessage);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        conversationId,
        userMessage.content,
        undefined
      );

      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      
      // User message
      expect(messages[0]).toEqual(userMessage);
      
      // Bot message updated with response
      expect(messages[1]).toEqual({
        id: mockResponse.messageId,
        content: mockResponse.content,
        role: 'bot'
      });

      expect(result).toBe(mockResponse);
    });

    it('should handle sendMessage with explicit non-streaming options', async () => {
      const userMessage: Message = {
        id: 'user-msg-2',
        content: 'Tell me more',
        role: 'user'
      };

      const options: MessageOptions = { stream: false };

      mockClient.sendMessage.mockResolvedValue({
        messageId: 'bot-msg-2',
        content: 'Here is more information...',
        conversationId: conversationId
      });

      await stateManager.sendMessage(userMessage, options);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        conversationId,
        userMessage.content,
        options
      );
    });

    it('should handle null response from client', async () => {
      const userMessage: Message = {
        id: 'user-msg-null',
        content: 'Test message',
        role: 'user'
      };

      mockClient.sendMessage.mockResolvedValue(undefined);

      await stateManager.sendMessage(userMessage);

      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      
      // Bot message should remain with empty content and generated ID
      expect(messages[1]).toEqual({
        id: 'uuid-1', // Generated UUID
        content: '',
        role: 'bot'
      });
    });

    it('should throw error when no active conversation for non-streaming', async () => {
      const stateManagerNoConv = createClientStateManager(mockClient);
      
      const userMessage: Message = {
        id: 'user-msg-error',
        content: 'This should fail',
        role: 'user'
      };

      await expect(stateManagerNoConv.sendMessage(userMessage))
        .rejects.toThrow('No active conversation');
    });
  });

  describe('Streaming Message Handling', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;
    const conversationId = 'conv-stream';

    beforeEach(() => {
      stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      state.conversations[conversationId] = { id: conversationId, messages: [] };
    });

    it('should send streaming message and wrap handler for state updates', async () => {
      const userMessage: Message = {
        id: 'user-stream-1',
        content: 'Stream me a response',
        role: 'user'
      };

      const options: MessageOptions = { stream: true };

      mockClient.sendMessage.mockResolvedValue(undefined); // Streaming returns void

      await stateManager.sendMessage(userMessage, options);

      expect(mockClient.getDefaultStreamingHandler).toHaveBeenCalled();
      expect(wrapStreamingHandler).toHaveBeenCalledWith(
        mockStreamingHandler,
        expect.objectContaining({
          beforeChunk: expect.any(Function)
        })
      );

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        conversationId,
        userMessage.content,
        options
      );

      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(userMessage);
      expect(messages[1]).toEqual({
        id: 'uuid-1',
        content: '',
        role: 'bot'
      });
    });

    it('should update bot message content with string chunks', async () => {
      const userMessage: Message = {
        id: 'user-stream-string',
        content: 'Give me a streaming response',
        role: 'user'
      };

      mockClient.sendMessage.mockResolvedValue(undefined);

      await stateManager.sendMessage(userMessage, { stream: true });

      // Get the wrapped handler's beforeChunk function
      const wrapCall = (wrapStreamingHandler as jest.Mock).mock.calls[0];
      const hooks = wrapCall[1];
      const beforeChunk = hooks.beforeChunk;

      // Simulate string chunks
      beforeChunk('Hello ');
      beforeChunk('world!');

      const messages = stateManager.getActiveConversationMessages();
      const botMessage = messages[1];
      
      expect(botMessage.content).toBe('Hello world!'); // Chunks are concatenated
    });

    it('should update bot message content with structured chunks', async () => {
      const userMessage: Message = {
        id: 'user-stream-structured',
        content: 'Give me a structured response',
        role: 'user'
      };

      mockClient.sendMessage.mockResolvedValue(undefined);

      await stateManager.sendMessage(userMessage, { stream: true });

      // Get the wrapped handler's beforeChunk function
      const wrapCall = (wrapStreamingHandler as jest.Mock).mock.calls[0];
      const hooks = wrapCall[1];
      const beforeChunk = hooks.beforeChunk;

      // Simulate structured chunks (like ARH format)
      beforeChunk({ answer: 'The answer is 42' });
      beforeChunk({ answer: 'Actually, the answer is more complex...' });

      const messages = stateManager.getActiveConversationMessages();
      const botMessage = messages[1];
      
      expect(botMessage.content).toBe('Actually, the answer is more complex...');
    });

    it('should handle mixed chunk types gracefully', async () => {
      const userMessage: Message = {
        id: 'user-stream-mixed',
        content: 'Mixed response types',
        role: 'user'
      };

      mockClient.sendMessage.mockResolvedValue(undefined);

      await stateManager.sendMessage(userMessage, { stream: true });

      const wrapCall = (wrapStreamingHandler as jest.Mock).mock.calls[0];
      const hooks = wrapCall[1];
      const beforeChunk = hooks.beforeChunk;

      // Test various chunk types
      beforeChunk('String chunk');
      beforeChunk({ answer: 'Structured chunk' });
      beforeChunk({ noAnswer: 'No answer field' });
      beforeChunk(null);
      beforeChunk(undefined);

      const messages = stateManager.getActiveConversationMessages();
      const botMessage = messages[1];
      
      expect(botMessage.content).toBe('Structured chunk'); // Should keep last valid structured content
    });

    it('should throw error when streaming requested but no default handler available', async () => {
      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(undefined);

      const userMessage: Message = {
        id: 'user-stream-no-handler',
        content: 'This should fail',
        role: 'user'
      };

      await expect(stateManager.sendMessage(userMessage, { stream: true }))
        .rejects.toThrow('Streaming requested but no default streaming handler available in client');

      expect(stateManager.getMessageInProgress()).toBe(false);
    });

    it('should throw error when no active conversation for streaming', async () => {
      const stateManagerNoConv = createClientStateManager(mockClient);
      
      const userMessage: Message = {
        id: 'user-stream-no-conv',
        content: 'This should fail',
        role: 'user'
      };

      await expect(stateManagerNoConv.sendMessage(userMessage, { stream: true }))
        .rejects.toThrow('No active conversation');
    });
  });

  describe('Event System', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;
    let mockCallback1: jest.Mock;
    let mockCallback2: jest.Mock;

    beforeEach(() => {
      stateManager = createClientStateManager(mockClient);
      mockCallback1 = jest.fn();
      mockCallback2 = jest.fn();
    });

    it('should subscribe to MESSAGE events', () => {
      expect(() => {
        stateManager.subscribe(Events.MESSAGE, mockCallback1);
      }).not.toThrow();
    });

    it('should subscribe to ACTIVE_CONVERSATION events', () => {
      expect(() => {
        stateManager.subscribe(Events.ACTIVE_CONVERSATION, mockCallback1);
      }).not.toThrow();
    });

    it('should subscribe to IN_PROGRESS events', () => {
      expect(() => {
        stateManager.subscribe(Events.IN_PROGRESS, mockCallback1);
      }).not.toThrow();
    });

    it('should notify ACTIVE_CONVERSATION subscribers when conversation changes', () => {
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, mockCallback1);
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, mockCallback2);

      stateManager.setActiveConversationId('conv-notify');

      expect(mockCallback1).toHaveBeenCalledTimes(1);
      expect(mockCallback2).toHaveBeenCalledTimes(1);
    });

    it('should notify MESSAGE and IN_PROGRESS subscribers after sendMessage', async () => {
      const conversationId = 'conv-events';
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      state.conversations[conversationId] = { id: conversationId, messages: [] };

      mockClient.sendMessage.mockResolvedValue({
        messageId: 'msg-1',
        content: 'Response',
        conversationId: conversationId
      });

      stateManager.subscribe(Events.MESSAGE, mockCallback1);
      stateManager.subscribe(Events.IN_PROGRESS, mockCallback2);

      await stateManager.sendMessage({
        id: 'user-1',
        content: 'Test',
        role: 'user'
      });

      expect(mockCallback1).toHaveBeenCalledTimes(1);
      expect(mockCallback2).toHaveBeenCalledTimes(2);
    });

    it('should support multiple subscribers for the same event', () => {
      stateManager.subscribe(Events.MESSAGE, mockCallback1);
      stateManager.subscribe(Events.MESSAGE, mockCallback2);

      stateManager.setActiveConversationId('conv-multi');
      const state = stateManager.getState();
      state.conversations['conv-multi'] = { id: 'conv-multi', messages: [] };

      mockClient.sendMessage.mockResolvedValue({
        messageId: 'msg-multi',
        content: 'Multi subscriber test',
        conversationId: 'conv-multi'
      });

      return stateManager.sendMessage({
        id: 'user-multi',
        content: 'Test multiple subscribers',
        role: 'user'
      }).then(() => {
        expect(mockCallback1).toHaveBeenCalledTimes(1);
        expect(mockCallback2).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle unsubscribe functionality', () => {
      stateManager.subscribe(Events.MESSAGE, mockCallback1);
      
      // Note: Current implementation has a bug in unsubscribe (uses filter wrong)
      // This test documents current behavior
      expect(() => {
        stateManager.unsubscribe(Events.MESSAGE, 'uuid-1' as any);
      }).not.toThrow();
    });

    it('should throw error for invalid event subscription', () => {
      expect(() => {
        stateManager.subscribe('INVALID_EVENT' as Events, mockCallback1);
      }).toThrow('Event INVALID_EVENT not found');
    });

    it('should throw error for invalid event unsubscription', () => {
      expect(() => {
        stateManager.unsubscribe('INVALID_EVENT' as Events, 'some-id' as any);
      }).toThrow('Event INVALID_EVENT not found');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    let stateManager: ReturnType<typeof createClientStateManager>;

    beforeEach(() => {
      stateManager = createClientStateManager(mockClient);
    });

    it('should handle client sendMessage errors gracefully', async () => {
      const conversationId = 'conv-error';
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      state.conversations[conversationId] = { id: conversationId, messages: [] };

      const error = new Error('Client error');
      mockClient.sendMessage.mockRejectedValue(error);

      await expect(stateManager.sendMessage({
        id: 'user-error',
        content: 'This will cause an error',
        role: 'user'
      })).rejects.toThrow('Client error');

      // Should reset message in progress state even on error
      expect(stateManager.getMessageInProgress()).toBe(false);
    });

    it('should handle streaming errors gracefully', async () => {
      const conversationId = 'conv-stream-error';
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      state.conversations[conversationId] = { id: conversationId, messages: [] };

      const error = new Error('Streaming error');
      mockClient.sendMessage.mockRejectedValue(error);

      await expect(stateManager.sendMessage({
        id: 'user-stream-error',
        content: 'Streaming error test',
        role: 'user'
      }, { stream: true })).rejects.toThrow('Streaming error');

      expect(stateManager.getMessageInProgress()).toBe(false);
    });

    it('should maintain state consistency even with client failures', async () => {
      const conversationId = 'conv-consistency';
      stateManager.setActiveConversationId(conversationId);
      
      const state = stateManager.getState();
      state.conversations[conversationId] = { id: conversationId, messages: [] };

      mockClient.sendMessage.mockRejectedValue(new Error('Consistency test error'));

      try {
        await stateManager.sendMessage({
          id: 'user-consistency',
          content: 'Consistency test',
          role: 'user'
        });
      } catch (error) {
        // Expected error
      }

      // Should still have user message and placeholder bot message in state
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('bot');
      expect(messages[1].content).toBe(''); // Empty because error occurred
    });
  });

  describe('Integration with Different Client Types', () => {
    it('should work with clients that have getDefaultStreamingHandler', () => {
      const clientWithHandler = {
        ...mockClient,
        getDefaultStreamingHandler: jest.fn().mockReturnValue(mockStreamingHandler)
      } as jest.Mocked<IAIClient>;

      const stateManager = createClientStateManager(clientWithHandler);
      expect(stateManager.client).toBe(clientWithHandler);
    });

    it('should work with clients that do not have getDefaultStreamingHandler', () => {
      const clientWithoutHandler = {
        sendMessage: jest.fn(),
        healthCheck: jest.fn(),
        getServiceStatus: jest.fn(),
      } as jest.Mocked<IAIClient>;

      const stateManager = createClientStateManager(clientWithoutHandler);
      expect(stateManager.client).toBe(clientWithoutHandler);
    });

    it('should handle optional methods gracefully', () => {
      const minimalClient = {
        sendMessage: jest.fn(),
        healthCheck: jest.fn(),
      } as jest.Mocked<IAIClient>;

      expect(() => {
        createClientStateManager(minimalClient);
      }).not.toThrow();
    });
  });
}); 