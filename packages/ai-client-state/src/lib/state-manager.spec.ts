import { createClientStateManager, Events, UserQuery } from './state-manager';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';

describe('ClientStateManager', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let stateManager: ReturnType<typeof createClientStateManager>;

  beforeEach(() => {
    mockClient = {
      init: jest.fn().mockResolvedValue({
        initialConversationId: 'test-conversation-id',
        conversations: []
      }),
      sendMessage: jest.fn(),
      healthCheck: jest.fn(),
      getDefaultStreamingHandler: jest.fn(),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      createNewConversation: jest.fn().mockResolvedValue({ id: 'new-conv', title: 'New Conversation', locked: false }),
      getServiceStatus: jest.fn()
    } as jest.Mocked<IAIClient>;

    stateManager = createClientStateManager(mockClient);
  });

  describe('Basic State Management', () => {
    it('should initialize with empty state', () => {
      const state = stateManager.getState();
      expect(state.conversations).toEqual({});
      expect(state.activeConversationId).toBeNull();
      expect(state.messageInProgress).toBe(false);
    });

    it('should set active conversation ID', () => {
      stateManager.setActiveConversationId('conv-123');
      
      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('conv-123');
      expect(state.conversations['conv-123']).toBeDefined();
      expect(state.conversations['conv-123'].messages).toEqual([]);
    });

    it('should get active conversation messages', () => {
      stateManager.setActiveConversationId('conv-123');
      
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toEqual([]);
    });

    it('should return empty array when no active conversation', () => {
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toEqual([]);
    });

    it('should track message in progress state', () => {
      expect(stateManager.getMessageInProgress()).toBe(false);
    });
  });

  describe('Message Sending', () => {
    beforeEach(() => {
      stateManager.setActiveConversationId('conv-456');
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'bot-msg-1',
        answer: 'Bot response',
        conversationId: 'conv-456'
      });
    });

    it('should send message successfully', async () => {
      const userMessage: UserQuery = 'Hello';

      const response = await stateManager.sendMessage(userMessage);

      expect(mockClient.sendMessage).toHaveBeenCalledWith('conv-456', 'Hello', undefined);
      expect(response).toBeDefined();
      expect(response.messageId).toBe('bot-msg-1');

      // Check state was updated
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        answer: 'Hello',
        role: 'user'
      }));
      expect(messages[1].role).toBe('bot');
      expect(messages[1].answer).toBe('Bot response');
    });

    it('should throw error when no active conversation is set', async () => {
      const stateManagerWithoutConv = createClientStateManager(mockClient);

      const userMessage: UserQuery = 'This should fail';

      await expect(
        stateManagerWithoutConv.sendMessage(userMessage)
      ).rejects.toThrow('No active conversation set. Call setActiveConversationId() first.');
    });

    it('should throw error when message is already in progress', async () => {
      const userMessage1: UserQuery = 'First message';

      const userMessage2: UserQuery = 'Second message';

      // Make the first call hang
      mockClient.sendMessage.mockImplementation(() => new Promise(() => {}));

      // Start first message (this will hang)
      const promise1 = stateManager.sendMessage(userMessage1);

      // Try to send second message immediately - should throw error
      await expect(
        stateManager.sendMessage(userMessage2)
      ).rejects.toThrow('A message is already being processed. Wait for it to complete before sending another message.');

      // Clean up the hanging promise
      promise1.catch(() => {}); // Prevent unhandled rejection warning
    });

    it('should reset progress flag on error', async () => {
      const userMessage: UserQuery = 'This will error';

      mockClient.sendMessage.mockRejectedValue(new Error('Network error'));

      await expect(
        stateManager.sendMessage(userMessage)
      ).rejects.toThrow('Network error');

      // Progress flag should be reset
      expect(stateManager.getMessageInProgress()).toBe(false);

      // Should be able to send another message now
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'bot-msg-success',
        answer: 'Success after error',
        conversationId: 'conv-456'
      });

      const successMessage: UserQuery = 'This should work';

      const response = await stateManager.sendMessage(successMessage);
      expect(response.messageId).toBe('bot-msg-success');
    });

    it('should handle streaming messages', async () => {
      const mockHandler = {
        onChunk: jest.fn(),
        onStart: jest.fn(),
        onComplete: jest.fn()
      };

      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(mockHandler);
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'streaming-msg',
        answer: 'Streaming response',
        conversationId: 'conv-456'
      });

      const userMessage: UserQuery = 'Stream this';

      const response = await stateManager.sendMessage(userMessage, { stream: true });

      expect(mockClient.sendMessage).toHaveBeenCalledWith('conv-456', 'Stream this', { stream: true, afterChunk: expect.any(Function) });
      expect(response).toBeDefined();
    });

    it('should throw error when streaming without handler', async () => {
      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(undefined);

      const userMessage: UserQuery = 'This should fail';

      await expect(
        stateManager.sendMessage(userMessage, { stream: true })
      ).rejects.toThrow('Streaming requested but no default streaming handler available in client');

      // Progress flag should be reset
      expect(stateManager.getMessageInProgress()).toBe(false);
    });
  });

  describe('Conversation Locking', () => {
    beforeEach(() => {
      mockClient.createNewConversation.mockResolvedValue({ 
        id: 'new-conv', 
        title: 'New Conversation',
        locked: false 
      });
    });

    it('should create unlocked conversations by default', async () => {
      const conversation = await stateManager.createNewConversation();
      
      expect(conversation.locked).toBe(false);
      expect(mockClient.createNewConversation).toHaveBeenCalled();
    });

    it('should prevent sending messages to locked conversations', async () => {
      // Set up a locked conversation
      await stateManager.setActiveConversationId('locked-conv');
      const state = stateManager.getState();
      state.conversations['locked-conv'].locked = true;

      const messageCallback = jest.fn();
      const progressCallback = jest.fn();
      stateManager.subscribe(Events.MESSAGE, messageCallback);
      stateManager.subscribe(Events.IN_PROGRESS, progressCallback);

      const userMessage: UserQuery = 'This should be blocked';
      
      await stateManager.sendMessage(userMessage);

      // Verify client sendMessage was NOT called
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
      
      // Verify locked message was added
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      
      // User message should still be added
      expect(messages[0].answer).toBe('This should be blocked');
      expect(messages[0].role).toBe('user');
      
      // Locked error message should be added
      expect(messages[1].answer).toBe('This conversation is locked and cannot accept new messages.');
      expect(messages[1].role).toBe('bot');
      
      // Events should be emitted
      expect(messageCallback).toHaveBeenCalledTimes(2); // User message + locked message
      expect(progressCallback).toHaveBeenCalledTimes(2); // Start + end
      
      // Progress should be reset
      expect(stateManager.getMessageInProgress()).toBe(false);
    });

    it('should allow sending messages to unlocked conversations', async () => {
      // Set up an unlocked conversation
      await stateManager.setActiveConversationId('unlocked-conv');
      const state = stateManager.getState();
      state.conversations['unlocked-conv'].locked = false;

      mockClient.sendMessage.mockResolvedValue({
        messageId: 'bot-msg-1',
        answer: 'Bot response',
        conversationId: 'unlocked-conv'
      });

      const userMessage: UserQuery = 'This should work';
      
      const response = await stateManager.sendMessage(userMessage);

      // Verify client sendMessage WAS called
      expect(mockClient.sendMessage).toHaveBeenCalledWith('unlocked-conv', 'This should work', undefined);
      expect(response).toBeDefined();
      expect(response.messageId).toBe('bot-msg-1');
      
      // Verify messages were added normally
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].answer).toBe('This should work');
      expect(messages[1].answer).toBe('Bot response');
    });

    it('should handle locked conversation in streaming mode', async () => {
      // Set up a locked conversation
      await stateManager.setActiveConversationId('locked-stream-conv');
      const state = stateManager.getState();
      state.conversations['locked-stream-conv'].locked = true;

      const mockHandler = {
        onStart: jest.fn(),
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };
      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(mockHandler);

      const userMessage: UserQuery = 'Stream this to locked conversation';
      
      await stateManager.sendMessage(userMessage, { stream: true });

      // Verify streaming was NOT initiated
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
      
      // Verify locked message was added
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[1].answer).toBe('This conversation is locked and cannot accept new messages.');
      expect(messages[1].role).toBe('bot');
    });

    it('should initialize conversations with locked status from client', async () => {
      const mockConversations = [
        { id: 'conv1', title: 'Conversation 1', locked: false },
        { id: 'conv2', title: 'Conversation 2', locked: true }
      ];

      mockClient.init.mockResolvedValue({
        initialConversationId: 'conv1',
        conversations: mockConversations
      });

      await stateManager.init();

      const state = stateManager.getState();
      expect(state.conversations['conv1'].locked).toBe(false);
      expect(state.conversations['conv2'].locked).toBe(true);
    });

    it('should handle missing locked property gracefully', async () => {
      const mockConversations = [
        { id: 'conv1', title: 'Conversation 1' } as any, // Simulate missing locked property
      ];

      mockClient.init.mockResolvedValue({
        initialConversationId: 'conv1',
        conversations: mockConversations
      });

      await stateManager.init();

      const state = stateManager.getState();
      expect(state.conversations['conv1'].locked).toBeFalsy(); // Should default to false
    });
  });

  describe('Event System', () => {
    it('should emit ACTIVE_CONVERSATION event when setting conversation', () => {
      const callback = jest.fn();
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, callback);

      stateManager.setActiveConversationId('conv-event-test');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should emit IN_PROGRESS events during message processing', async () => {
      const progressCallback = jest.fn();
      stateManager.subscribe(Events.IN_PROGRESS, progressCallback);

      stateManager.setActiveConversationId('conv-progress');
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'msg-progress',
        answer: 'Progress test',
        conversationId: 'conv-progress'
      });

      const userMessage: UserQuery = 'Test progress events';

      await stateManager.sendMessage(userMessage);

      // Should be called twice: start and end of processing
      expect(progressCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle subscription and unsubscription', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsubscribe1 = stateManager.subscribe(Events.ACTIVE_CONVERSATION, callback1);
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, callback2);

      stateManager.setActiveConversationId('conv-unsub-test');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      // Unsubscribe first callback
      unsubscribe1();

      stateManager.setActiveConversationId('conv-unsub-test-2');

      expect(callback1).toHaveBeenCalledTimes(1); // No additional calls
      expect(callback2).toHaveBeenCalledTimes(2); // Called again
    });

    it('should handle errors in event callbacks gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      stateManager.subscribe(Events.ACTIVE_CONVERSATION, errorCallback);
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, goodCallback);

      stateManager.setActiveConversationId('conv-error-test');

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(goodCallback).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('Error in event callback:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('Multi-Message Conversation Flow', () => {
    it('should handle multiple messages in sequence', async () => {
      stateManager.setActiveConversationId('conv-multi');

      // Mock responses for multiple calls
      mockClient.sendMessage
        .mockResolvedValueOnce({
          messageId: 'msg-1',
          answer: 'First response',
          conversationId: 'conv-multi'
        })
        .mockResolvedValueOnce({
          messageId: 'msg-2',
          answer: 'Second response',
          conversationId: 'conv-multi'
        });

      // Send first message
      await stateManager.sendMessage('First question');

      // Send second message
      await stateManager.sendMessage('Second question');

      // Verify conversation history
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2); // Last user + last bot messages only

      expect(messages[0]).toEqual({
        id: expect.any(String),
        answer: 'Second question',
        role: 'user'
      });
      expect(messages[1]).toEqual({
        id: expect.any(String),
        answer: 'Second response',
        role: 'bot'
      });
    });
  });

  describe('Initialization', () => {
    beforeEach(() => {
      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'initial-conv-id',
        conversations: [
          { id: 'initial-conv-id', title: 'Initial Conversation' },
          { id: 'conv-2', title: 'Second Conversation' }
        ]
      });
      mockClient.getConversationHistory = jest.fn().mockResolvedValue([
        {
          message_id: 'msg-1',
          input: 'Hello',
          answer: 'Hi there!',
          role: 'bot',
          additionalData: { sources: [] }
        }
      ]);
    });

    it('should initialize state with client data', async () => {
      await stateManager.init();
      
      const state = stateManager.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.isInitializing).toBe(false);
      expect(state.activeConversationId).toBe('initial-conv-id');
      expect(Object.keys(state.conversations)).toHaveLength(2);
      expect(state.conversations['initial-conv-id']).toBeDefined();
      expect(state.conversations['conv-2']).toBeDefined();
    });

    it('should load conversation history for initial conversation', async () => {
      await stateManager.init();
      
      const state = stateManager.getState();
      const initialConversation = state.conversations['initial-conv-id'];
      expect(initialConversation.messages).toHaveLength(2); // user + bot message
      expect(initialConversation.messages[0]).toMatchObject({
        id: 'msg-1',
        answer: 'Hello',
        role: 'user'
      });
      expect(initialConversation.messages[1]).toMatchObject({
        id: 'msg-1',
        answer: 'Hi there!',
        role: 'bot',
        additionalData: { sources: [] }
      });
    });

    it('should call client.init() method', async () => {
      await stateManager.init();
      
      expect(mockClient.init).toHaveBeenCalledTimes(1);
      expect(mockClient.getConversationHistory).toHaveBeenCalledWith('initial-conv-id');
    });

    it('should not initialize twice', async () => {
      await stateManager.init();
      await stateManager.init();
      
      expect(mockClient.init).toHaveBeenCalledTimes(1);
    });

    it('should not initialize while already initializing', async () => {
      const initPromise1 = stateManager.init();
      const initPromise2 = stateManager.init();
      
      await Promise.all([initPromise1, initPromise2]);
      
      expect(mockClient.init).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      const initError = new Error('Initialization failed');
      mockClient.init = jest.fn().mockRejectedValue(initError);
      
      await expect(stateManager.init()).rejects.toThrow('Initialization failed');
      
      const state = stateManager.getState();
      expect(state.isInitialized).toBe(false);
      expect(state.isInitializing).toBe(false);
    });

    it('should set initializing state during init', async () => {
      let initializingDuringInit = false;
      
      // Mock a delayed init
      mockClient.init = jest.fn().mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => {
            // Check if initializing is true during the init process
            initializingDuringInit = stateManager.isInitializing();
            resolve({
              initialConversationId: 'initial-conv-id',
              conversations: []
            });
          }, 10);
        })
      );
      
      const initPromise = stateManager.init();
      
      // Should be initializing immediately after starting
      expect(stateManager.isInitializing()).toBe(true);
      
      await initPromise;
      
      // Should have been initializing during the process
      expect(initializingDuringInit).toBe(true);
      
      // Should not be initializing after completion
      expect(stateManager.isInitializing()).toBe(false);
      expect(stateManager.isInitialized()).toBe(true);
    });
  });

  describe('Create New Conversation', () => {
    beforeEach(() => {
      mockClient.createNewConversation = jest.fn().mockResolvedValue({
        id: 'new-conv-id',
        title: 'New Conversation'
      });
      mockClient.getConversationHistory = jest.fn().mockResolvedValue([]);
    });

    it('should create new conversation via client', async () => {
      const conversation = await stateManager.createNewConversation();
      
      expect(mockClient.createNewConversation).toHaveBeenCalledTimes(1);
      expect(conversation).toEqual({
        id: 'new-conv-id',
        title: 'New Conversation'
      });
    });

    it('should add new conversation to state', async () => {
      await stateManager.createNewConversation();
      
      const state = stateManager.getState();
      expect(state.conversations['new-conv-id']).toBeDefined();
      expect(state.conversations['new-conv-id'].title).toBe('New conversation');
      expect(state.conversations['new-conv-id'].messages).toEqual([]);
    });

    it('should set new conversation as active', async () => {
      await stateManager.createNewConversation();
      
      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('new-conv-id');
    });

    it('should handle createNewConversation errors', async () => {
      const createError = new Error('Failed to create conversation');
      mockClient.createNewConversation = jest.fn().mockRejectedValue(createError);
      
      await expect(stateManager.createNewConversation()).rejects.toThrow('Failed to create conversation');
    });

    it('should fetch conversation history for new conversation', async () => {
      await stateManager.createNewConversation();
      
      expect(mockClient.getConversationHistory).toHaveBeenCalledWith('new-conv-id');
    });
  });

  describe('Enhanced setActiveConversationId with History Fetching', () => {
    beforeEach(() => {
      mockClient.getConversationHistory = jest.fn().mockResolvedValue([
        {
          message_id: 'msg-1',
          input: 'Test input',
          answer: 'Test response',
          role: 'bot',
          additionalData: { metadata: 'test' }
        }
      ]);
    });

    it('should fetch conversation history when setting active conversation', async () => {
      await stateManager.setActiveConversationId('test-conv-id');
      
      expect(mockClient.getConversationHistory).toHaveBeenCalledWith('test-conv-id');
      
      const state = stateManager.getState();
      const conversation = state.conversations['test-conv-id'];
      expect(conversation.messages).toHaveLength(2); // user + bot message
    });

    it('should convert history messages to correct format', async () => {
      await stateManager.setActiveConversationId('test-conv-id');
      
      const state = stateManager.getState();
      const conversation = state.conversations['test-conv-id'];
      
      expect(conversation.messages[0]).toMatchObject({
        id: 'msg-1',
        answer: 'Test input',
        role: 'user'
      });
      
      expect(conversation.messages[1]).toMatchObject({
        id: 'msg-1',
        answer: 'Test response',
        role: 'bot',
        additionalData: { metadata: 'test' }
      });
    });

    it('should handle history fetch errors gracefully', async () => {
      const historyError = new Error('Failed to fetch history');
      mockClient.getConversationHistory = jest.fn().mockRejectedValue(historyError);
      
      // Should not throw, but log error internally
      await stateManager.setActiveConversationId('test-conv-id');
      
      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('test-conv-id');
      expect(state.conversations['test-conv-id']).toBeDefined();
    });

    it('should set initializing state during history fetch', async () => {
      let initializingDuringFetch = false;
      
      mockClient.getConversationHistory = jest.fn().mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            initializingDuringFetch = stateManager.isInitializing();
            resolve([]);
          }, 10);
        })
      );
      
      const setActivePromise = stateManager.setActiveConversationId('test-conv-id');
      
      // Should be initializing during the fetch
      expect(stateManager.isInitializing()).toBe(true);
      
      await setActivePromise;
      
      expect(initializingDuringFetch).toBe(true);
      expect(stateManager.isInitializing()).toBe(false);
    });

    it('should handle null history response', async () => {
      mockClient.getConversationHistory = jest.fn().mockResolvedValue(null);
      
      await stateManager.setActiveConversationId('test-conv-id');
      
      const state = stateManager.getState();
      const conversation = state.conversations['test-conv-id'];
      expect(conversation.messages).toEqual([]);
    });
  });

  describe('isInitialized and isInitializing', () => {
    it('should return false for isInitialized initially', () => {
      expect(stateManager.isInitialized()).toBe(false);
    });

    it('should return false for isInitializing initially', () => {
      expect(stateManager.isInitializing()).toBe(false);
    });

    it('should return true for isInitialized after successful init', async () => {
      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'test-id',
        conversations: []
      });
      mockClient.getConversationHistory = jest.fn().mockResolvedValue([]);
      
      await stateManager.init();
      
      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.isInitializing()).toBe(false);
    });
  });
}); 
