import { createClientStateManager, Events, UserQuery } from './state-manager';
import type {
  IAIClient,
  ClientInitLimitation,
} from '@redhat-cloud-services/ai-client-common';

describe('ClientStateManager', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let stateManager: ReturnType<typeof createClientStateManager>;

  beforeEach(() => {
    mockClient = {
      init: jest.fn().mockResolvedValue({
        conversations: [],
      }),
      sendMessage: jest.fn(),
      healthCheck: jest.fn(),
      getDefaultStreamingHandler: jest.fn(),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      createNewConversation: jest.fn().mockResolvedValue({
        id: 'new-conv',
        title: 'New Conversation',
        locked: false,
      }),
      getServiceStatus: jest.fn(),
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

    it('should set active conversation ID', async () => {
      await stateManager.setActiveConversationId('conv-123');

      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('conv-123');
      expect(state.conversations['conv-123']).toBeDefined();
      expect(state.conversations['conv-123'].messages).toEqual([]);
    });

    it('should get active conversation messages', async () => {
      await stateManager.setActiveConversationId('conv-123');

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
    beforeEach(async () => {
      await stateManager.setActiveConversationId('conv-456');
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'bot-msg-1',
        answer: 'Bot response',
        conversationId: 'conv-456',
      });
    });

    it('should send message successfully', async () => {
      const userMessage: UserQuery = 'Hello';

      const response = await stateManager.sendMessage(userMessage);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        'conv-456',
        'Hello',
        undefined
      );
      expect(response).toBeDefined();
      expect(response.messageId).toBe('bot-msg-1');

      // Check state was updated
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          answer: 'Hello',
          role: 'user',
        })
      );
      expect(messages[1].role).toBe('bot');
      expect(messages[1].answer).toBe('Bot response');
    });

    it('should auto-create temporary conversation when no active conversation is set', async () => {
      const stateManagerWithoutConv = createClientStateManager(mockClient);

      const userMessage: UserQuery = 'Hello from auto-created conversation';

      await stateManagerWithoutConv.sendMessage(userMessage);

      // Should have auto-created a conversation and promoted it to real conversation
      expect(mockClient.createNewConversation).toHaveBeenCalledTimes(1);

      const state = stateManagerWithoutConv.getState();
      expect(state.activeConversationId).toBe('new-conv'); // ID from mock after promotion
      expect(state.conversations['new-conv'].messages).toHaveLength(2); // user + bot
      expect(state.conversations['__temp_conversation__']).toBeUndefined(); // temp should be cleaned up
    });

    it('should throw error when message is already in progress', async () => {
      const userMessage1: UserQuery = 'First message';

      const userMessage2: UserQuery = 'Second message';

      // Make the first call hang
      mockClient.sendMessage.mockImplementation(() => new Promise(() => {}));

      // Start first message (this will hang)
      const promise1 = stateManager.sendMessage(userMessage1);

      // Try to send second message immediately - should throw error
      await expect(stateManager.sendMessage(userMessage2)).rejects.toThrow(
        'A message is already being processed. Wait for it to complete before sending another message.'
      );

      // Clean up the hanging promise
      promise1.catch(() => {}); // Prevent unhandled rejection warning
    });

    it('should reset progress flag on error', async () => {
      const userMessage: UserQuery = 'This will error';

      mockClient.sendMessage.mockRejectedValue(new Error('Network error'));

      await expect(stateManager.sendMessage(userMessage)).rejects.toThrow(
        'Network error'
      );

      // Progress flag should be reset
      expect(stateManager.getMessageInProgress()).toBe(false);

      // Should be able to send another message now
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'bot-msg-success',
        answer: 'Success after error',
        conversationId: 'conv-456',
      });

      const successMessage: UserQuery = 'This should work';

      const response = await stateManager.sendMessage(successMessage);
      expect(response.messageId).toBe('bot-msg-success');
    });

    it('should handle streaming messages', async () => {
      const mockHandler = {
        onChunk: jest.fn(),
        onStart: jest.fn(),
        onComplete: jest.fn(),
      };

      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(
        mockHandler
      );
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'streaming-msg',
        answer: 'Streaming response',
        conversationId: 'conv-456',
      });

      const userMessage: UserQuery = 'Stream this';

      const response = await stateManager.sendMessage(userMessage, {
        stream: true,
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        'conv-456',
        'Stream this',
        { stream: true, afterChunk: expect.any(Function) }
      );
      expect(response).toBeDefined();
    });

    it('should throw error when streaming without handler', async () => {
      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(
        undefined
      );

      const userMessage: UserQuery = 'This should fail';

      await expect(
        stateManager.sendMessage(userMessage, { stream: true })
      ).rejects.toThrow(
        'Streaming requested but no default streaming handler available in client'
      );

      // Progress flag should be reset
      expect(stateManager.getMessageInProgress()).toBe(false);
    });
  });

  describe('Conversation Locking', () => {
    beforeEach(() => {
      mockClient.createNewConversation.mockResolvedValue({
        id: 'new-conv',
        title: 'New Conversation',
        locked: false,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      });
    });

    it('should create unlocked conversations by default', async () => {
      const conversation = await stateManager.createNewConversation(true);

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
      expect(messages[1].answer).toBe(
        'This conversation is locked and cannot accept new messages.'
      );
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
        conversationId: 'unlocked-conv',
      });

      const userMessage: UserQuery = 'This should work';

      const response = await stateManager.sendMessage(userMessage);

      // Verify client sendMessage WAS called
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        'unlocked-conv',
        'This should work',
        undefined
      );
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
      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(
        mockHandler
      );

      const userMessage: UserQuery = 'Stream this to locked conversation';

      await stateManager.sendMessage(userMessage, { stream: true });

      // Verify streaming was NOT initiated
      expect(mockClient.sendMessage).not.toHaveBeenCalled();

      // Verify locked message was added
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[1].answer).toBe(
        'This conversation is locked and cannot accept new messages.'
      );
      expect(messages[1].role).toBe('bot');
    });

    it('should initialize conversations with locked status from client', async () => {
      const mockConversations = [
        {
          id: 'conv1',
          title: 'Conversation 1',
          locked: false,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'conv2',
          title: 'Conversation 2',
          locked: true,
          createdAt: new Date('2025-01-01T00:01:00Z'),
        },
      ];

      mockClient.init.mockResolvedValue({
        conversations: mockConversations,
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
        conversations: mockConversations,
      });

      await stateManager.init();

      const state = stateManager.getState();
      expect(state.conversations['conv1'].locked).toBeFalsy(); // Should default to false
    });

    it('should lock all previous conversations when creating a new conversation', async () => {
      // Set up existing conversations in state
      await stateManager.init();

      // Create first conversation
      await stateManager.setActiveConversationId('conv-1');
      const state1 = stateManager.getState();
      state1.conversations['conv-1'].locked = false;

      // Create second conversation
      await stateManager.setActiveConversationId('conv-2');
      const state2 = stateManager.getState();
      state2.conversations['conv-2'].locked = false;

      // Verify both conversations are initially unlocked
      expect(state2.conversations['conv-1'].locked).toBe(false);
      expect(state2.conversations['conv-2'].locked).toBe(false);

      // Mock createNewConversation to return a new conversation
      mockClient.createNewConversation.mockResolvedValue({
        id: 'conv-3',
        title: 'New Conversation',
        locked: false,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      });

      // Create a new conversation - this should lock all previous conversations
      const newConversation = await stateManager.createNewConversation(true);

      const finalState = stateManager.getState();

      // Verify previous conversations are now locked
      expect(finalState.conversations['conv-1'].locked).toBe(true);
      expect(finalState.conversations['conv-2'].locked).toBe(true);

      // Verify new conversation is unlocked and active
      expect(finalState.conversations['conv-3'].locked).toBe(false);
      expect(finalState.activeConversationId).toBe('conv-3');
      expect(newConversation.id).toBe('conv-3');
    });
  });

  describe('Event System', () => {
    it('should emit ACTIVE_CONVERSATION event when setting conversation', async () => {
      const callback = jest.fn();
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, callback);

      await stateManager.setActiveConversationId('conv-event-test');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should emit IN_PROGRESS events during message processing', async () => {
      const progressCallback = jest.fn();
      stateManager.subscribe(Events.IN_PROGRESS, progressCallback);

      await stateManager.setActiveConversationId('conv-progress');
      mockClient.sendMessage.mockResolvedValue({
        messageId: 'msg-progress',
        answer: 'Progress test',
        conversationId: 'conv-progress',
      });

      const userMessage: UserQuery = 'Test progress events';

      await stateManager.sendMessage(userMessage);

      // Should be called twice: start and end of processing
      expect(progressCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle subscription and unsubscription', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsubscribe1 = stateManager.subscribe(
        Events.ACTIVE_CONVERSATION,
        callback1
      );
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, callback2);

      await stateManager.setActiveConversationId('conv-unsub-test');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      // Unsubscribe first callback
      unsubscribe1();

      await stateManager.setActiveConversationId('conv-unsub-test-2');

      expect(callback1).toHaveBeenCalledTimes(1); // No additional calls
      expect(callback2).toHaveBeenCalledTimes(2); // Called again
    });

    it('should handle errors in event callbacks gracefully', async () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      stateManager.subscribe(Events.ACTIVE_CONVERSATION, errorCallback);
      stateManager.subscribe(Events.ACTIVE_CONVERSATION, goodCallback);

      await stateManager.setActiveConversationId('conv-error-test');

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(goodCallback).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in event callback:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Multi-Message Conversation Flow', () => {
    it('should handle multiple messages in sequence', async () => {
      await stateManager.setActiveConversationId('conv-multi');

      // Mock responses for multiple calls
      mockClient.sendMessage
        .mockResolvedValueOnce({
          messageId: 'msg-1',
          answer: 'First response',
          conversationId: 'conv-multi',
        })
        .mockResolvedValueOnce({
          messageId: 'msg-2',
          answer: 'Second response',
          conversationId: 'conv-multi',
        });

      // Send first message
      await stateManager.sendMessage('First question');

      // Send second message
      await stateManager.sendMessage('Second question');

      // Verify conversation history
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(4); // 2 user + 2 bot messages

      expect(messages[0]).toEqual({
        id: expect.any(String),
        date: expect.any(Date),
        answer: 'First question',
        role: 'user',
      });
      expect(messages[1]).toEqual({
        id: expect.any(String),
        date: expect.any(Date),
        answer: 'First response',
        role: 'bot',
      });
      expect(messages[2]).toEqual({
        id: expect.any(String),
        date: expect.any(Date),
        answer: 'Second question',
        role: 'user',
      });
      expect(messages[3]).toEqual({
        id: expect.any(String),
        date: expect.any(Date),
        answer: 'Second response',
        role: 'bot',
      });
    });
  });

  describe('Initialization', () => {
    beforeEach(() => {
      mockClient.init = jest.fn().mockResolvedValue({
        conversations: [
          { id: 'initial-conv-id', title: 'Initial Conversation' },
          { id: 'conv-2', title: 'Second Conversation' },
        ],
      });
      mockClient.getConversationHistory = jest.fn().mockResolvedValue([
        {
          message_id: 'msg-1',
          input: 'Hello',
          answer: 'Hi there!',
          role: 'bot',
          additionalAttributes: { sources: [] },
        },
      ]);
    });

    it('should initialize state with client data', async () => {
      await stateManager.init();

      const state = stateManager.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.isInitializing).toBe(false);
      expect(state.activeConversationId).toBeNull(); // No auto-activation
      expect(Object.keys(state.conversations)).toHaveLength(2);
      expect(state.conversations['initial-conv-id']).toBeDefined();
      expect(state.conversations['conv-2']).toBeDefined();
    });

    it('should not auto-load conversation history during init', async () => {
      await stateManager.init();

      const state = stateManager.getState();
      // Conversations should exist but with empty messages (no auto-loading)
      expect(state.conversations['initial-conv-id']).toBeDefined();
      expect(state.conversations['initial-conv-id'].messages).toHaveLength(0);
      expect(state.conversations['conv-2']).toBeDefined();
      expect(state.conversations['conv-2'].messages).toHaveLength(0);

      // History is only loaded when conversation becomes active
      expect(mockClient.getConversationHistory).not.toHaveBeenCalled();
    });

    it('should call client.init() method', async () => {
      await stateManager.init();

      expect(mockClient.init).toHaveBeenCalledTimes(1);
      // No longer auto-loads conversation history during init
      expect(mockClient.getConversationHistory).not.toHaveBeenCalled();
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

      await expect(stateManager.init()).rejects.toThrow(
        'Initialization failed'
      );

      const state = stateManager.getState();
      // After error handling update, isInitialized should be true so user can see error message
      expect(state.isInitialized).toBe(true);
      expect(state.isInitializing).toBe(false);

      // Verify error message was added to conversation
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('bot');
      // Regular Error objects get JSON.stringify which returns "{}" for Error objects
      expect(messages[0].answer).toBe('{}');
    });

    it('should set initializing state during init', async () => {
      let initializingDuringInit = false;

      // Mock a delayed init
      mockClient.init = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              // Check if initializing is true during the init process
              initializingDuringInit = stateManager.isInitializing();
              resolve({
                conversations: [],
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
        title: 'New Conversation',
      });
      mockClient.getConversationHistory = jest.fn().mockResolvedValue([]);
    });

    it('should create new conversation via client', async () => {
      const conversation = await stateManager.createNewConversation(true);

      expect(mockClient.createNewConversation).toHaveBeenCalledTimes(1);
      expect(conversation).toEqual({
        id: 'new-conv-id',
        title: 'New Conversation',
      });
    });

    it('should add new conversation to state', async () => {
      await stateManager.createNewConversation(true);

      const state = stateManager.getState();
      expect(state.conversations['new-conv-id']).toBeDefined();
      expect(state.conversations['new-conv-id'].title).toBe('New conversation');
      expect(state.conversations['new-conv-id'].messages).toEqual([]);
    });

    it('should set new conversation as active', async () => {
      await stateManager.createNewConversation(true);

      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('new-conv-id');
    });

    it('should handle createNewConversation errors', async () => {
      const createError = new Error('Failed to create conversation');
      mockClient.createNewConversation = jest
        .fn()
        .mockRejectedValue(createError);
      stateManager.getState().conversations['new-conv-id'] = {
        id: 'new-conv-id',
        title: 'New Conversation',
        messages: [],
        locked: false,
        createdAt: new Date(),
      };
      stateManager.getState().activeConversationId = 'new-conv-id';

      await expect(stateManager.createNewConversation(true)).rejects.toThrow(
        'Failed to create conversation'
      );
    });

    it('should not fetch conversation history for new conversation if existing conversation has no messages', async () => {
      await stateManager.createNewConversation();

      expect(mockClient.getConversationHistory).not.toHaveBeenCalled();
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
          additionalAttributes: { metadata: 'test' },
        },
      ]);
    });

    it('should fetch conversation history when setting active conversation', async () => {
      await stateManager.setActiveConversationId('test-conv-id');

      expect(mockClient.getConversationHistory).toHaveBeenCalledWith(
        'test-conv-id'
      );

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
        role: 'user',
      });

      expect(conversation.messages[1]).toMatchObject({
        id: 'msg-1',
        answer: 'Test response',
        role: 'bot',
        additionalAttributes: { metadata: 'test' },
      });
    });

    it('should handle history fetch errors gracefully', async () => {
      const historyError = new Error('Failed to fetch history');
      mockClient.getConversationHistory = jest
        .fn()
        .mockRejectedValue(historyError);

      // Should not throw, but log error internally
      await stateManager.setActiveConversationId('test-conv-id');

      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('test-conv-id');
      expect(state.conversations['test-conv-id']).toBeDefined();
    });

    it('should set initializing state during history fetch', async () => {
      let initializingDuringFetch = false;

      mockClient.getConversationHistory = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              initializingDuringFetch = stateManager.isInitializing();
              resolve([]);
            }, 10);
          })
      );

      const setActivePromise =
        stateManager.setActiveConversationId('test-conv-id');

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

    it('should emit INITIALIZING_MESSAGES event immediately when starting history fetch', async () => {
      const initializingCallback = jest.fn();
      let resolveHistory: (value: any) => void;

      // Create a promise that we control when to resolve
      const historyPromise = new Promise((resolve) => {
        resolveHistory = resolve;
      });

      mockClient.getConversationHistory = jest
        .fn()
        .mockReturnValue(historyPromise);
      stateManager.subscribe(
        Events.INITIALIZING_MESSAGES,
        initializingCallback
      );

      // Start the setActiveConversationId but don't await it yet
      const setActivePromise =
        stateManager.setActiveConversationId('test-conv-id');

      // Check that initializing state is true immediately
      expect(stateManager.isInitializing()).toBe(true);
      // Check that INITIALIZING_MESSAGES event was emitted
      expect(initializingCallback).toHaveBeenCalledTimes(1);

      // Now resolve the history fetch
      resolveHistory!([]);
      await setActivePromise;

      // After completion, should not be initializing and event should be emitted again
      expect(stateManager.isInitializing()).toBe(false);
      expect(initializingCallback).toHaveBeenCalledTimes(2); // Start + end
    });

    it('should emit INITIALIZING_MESSAGES event on both start and end of history fetch', async () => {
      const initializingCallback = jest.fn();
      const initializingStates: boolean[] = [];

      // Track the initializing state each time the event is emitted
      stateManager.subscribe(Events.INITIALIZING_MESSAGES, () => {
        initializingStates.push(stateManager.isInitializing());
        initializingCallback();
      });

      let resolveHistory: (value: any) => void;
      const historyPromise = new Promise((resolve) => {
        resolveHistory = resolve;
      });

      mockClient.getConversationHistory = jest
        .fn()
        .mockReturnValue(historyPromise);

      // Start the operation
      const setActivePromise =
        stateManager.setActiveConversationId('test-conv-id');

      // Verify first emission (start of loading)
      expect(initializingCallback).toHaveBeenCalledTimes(1);
      expect(initializingStates[0]).toBe(true);

      // Complete the operation
      resolveHistory!([
        {
          message_id: 'test-msg',
          input: 'Test input',
          answer: 'Test response',
          date: new Date(),
          additionalAttributes: { test: 'data' },
        },
      ]);
      await setActivePromise;

      // Verify second emission (end of loading)
      expect(initializingCallback).toHaveBeenCalledTimes(2);
      expect(initializingStates[1]).toBe(false);
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
        conversations: [],
      });
      mockClient.getConversationHistory = jest.fn().mockResolvedValue([]);

      await stateManager.init();

      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.isInitializing()).toBe(false);
    });
  });

  describe('Client Init Limitation', () => {
    it('should handle init limitation from client', async () => {
      const mockLimitation: ClientInitLimitation = {
        reason: 'QUOTA_EXCEEDED',
        detail: 'Daily limit reached',
      };

      mockClient.init = jest.fn().mockResolvedValue({
        conversations: [],
        limitation: mockLimitation,
      });

      await stateManager.init();

      expect(stateManager.getInitLimitation()).toEqual(mockLimitation);
    });
  });

  describe('Lazy Initialization Edge Cases', () => {
    beforeEach(() => {
      // Reset mocks for edge case testing
      mockClient.sendMessage = jest.fn().mockResolvedValue({
        messageId: 'test-msg',
        answer: 'Test response',
        conversationId: 'new-conv',
      });
    });

    it('should expose isTemporaryConversation() method correctly', async () => {
      // Initially no conversation
      expect(stateManager.isTemporaryConversation()).toBe(false);

      // Send message which creates temporary then promotes
      await stateManager.sendMessage('Hello');

      // Should be promoted to real conversation after sendMessage completes
      expect(stateManager.isTemporaryConversation()).toBe(false);
      expect(stateManager.getActiveConversationId()).toBe('new-conv');
    });

    it('should handle createNewConversation failure during promotion gracefully', async () => {
      mockClient.createNewConversation = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await stateManager.sendMessage('Hello');

      const state = stateManager.getState();
      // Should remain in temporary conversation
      expect(state.activeConversationId).toBe('__temp_conversation__');
      expect(state.conversations['__temp_conversation__']).toBeDefined();
      expect(state.promotionRetryCount).toBe(1);
    });

    it('should retry promotion and show error message after max attempts', async () => {
      mockClient.createNewConversation = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));

      // First attempt (retry count = 1)
      await stateManager.sendMessage('Hello');

      // Second attempt (retry count = 2, should show error message)
      await stateManager.sendMessage('World');

      const state = stateManager.getState();
      const messages = state.conversations['__temp_conversation__'].messages;

      // Should have user messages + error message
      const errorMessage = messages.find(
        (msg) =>
          msg.role === 'bot' &&
          msg.answer.includes('Unable to initialize conversation')
      );
      expect(errorMessage).toBeDefined();
      expect(state.promotionRetryCount).toBe(2);
    });

    it('should only promote temporary conversation once for multiple messages', async () => {
      // Send multiple messages sequentially to avoid race conditions
      await stateManager.sendMessage('Hello');
      await stateManager.sendMessage('World');
      await stateManager.sendMessage('Test');

      // Should only call createNewConversation once (for the first message)
      expect(mockClient.createNewConversation).toHaveBeenCalledTimes(1);

      const state = stateManager.getState();
      expect(state.activeConversationId).toBe('new-conv');
      expect(state.conversations['__temp_conversation__']).toBeUndefined();
    });

    it('should work with streaming in temporary conversations', async () => {
      const mockHandler = {
        onChunk: jest.fn(),
        onStart: jest.fn(),
        onComplete: jest.fn(),
      };

      mockClient.getDefaultStreamingHandler = jest
        .fn()
        .mockReturnValue(mockHandler);

      await stateManager.sendMessage('Hello', { stream: true });

      // Should promote and work with streaming
      expect(mockClient.createNewConversation).toHaveBeenCalledTimes(1);
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        'new-conv',
        'Hello',
        expect.objectContaining({ stream: true })
      );
    });

    it('should emit proper events during temporary conversation promotion', async () => {
      const activeConversationEvents: string[] = [];
      const conversationEvents: number[] = [];

      stateManager.subscribe(Events.ACTIVE_CONVERSATION, () => {
        activeConversationEvents.push(
          stateManager.getActiveConversationId() || 'null'
        );
      });

      stateManager.subscribe(Events.CONVERSATIONS, () => {
        conversationEvents.push(Date.now());
      });

      await stateManager.sendMessage('Hello');

      // Should emit ACTIVE_CONVERSATION events (temp creation + promotion)
      expect(activeConversationEvents.length).toBeGreaterThanOrEqual(2);
      expect(activeConversationEvents).toContain('__temp_conversation__');
      expect(activeConversationEvents).toContain('new-conv');

      // Should emit CONVERSATIONS events
      expect(conversationEvents.length).toBeGreaterThan(0);
    });

    it('should reset retry count on successful promotion after failures', async () => {
      // First, simulate a failure
      mockClient.createNewConversation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          id: 'new-conv-retry',
          title: 'New Conversation',
          locked: false,
          createdAt: new Date(),
        });

      // First message fails promotion
      await stateManager.sendMessage('Hello');

      let state = stateManager.getState();
      expect(state.promotionRetryCount).toBe(1);

      // Second message succeeds
      await stateManager.sendMessage('World');

      state = stateManager.getState();
      expect(state.promotionRetryCount).toBe(0); // Reset on success
      expect(state.activeConversationId).toBe('new-conv-retry');
    });
  });
});
