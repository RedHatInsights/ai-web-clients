import { createClientStateManager, Events, type Message } from './state-manager';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';

describe('ClientStateManager', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let stateManager: ReturnType<typeof createClientStateManager>;

  beforeEach(() => {
    mockClient = {
      sendMessage: jest.fn(),
      healthCheck: jest.fn(),
      getDefaultStreamingHandler: jest.fn()
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
      const userMessage: Message = {
        id: 'user-msg-1',
        answer: 'Hello',
        role: 'user'
      };

      const response = await stateManager.sendMessage(userMessage);

      expect(mockClient.sendMessage).toHaveBeenCalledWith('conv-456', 'Hello', undefined);
      expect(response).toBeDefined();
      expect(response.messageId).toBe('bot-msg-1');

      // Check state was updated
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(userMessage);
      expect(messages[1].role).toBe('bot');
      expect(messages[1].answer).toBe('Bot response');
    });

    it('should throw error when no active conversation is set', async () => {
      const stateManagerWithoutConv = createClientStateManager(mockClient);
      
      const userMessage: Message = {
        id: 'user-msg-error',
        answer: 'This should fail',
        role: 'user'
      };

      await expect(
        stateManagerWithoutConv.sendMessage(userMessage)
      ).rejects.toThrow('No active conversation set. Call setActiveConversationId() first.');
    });

    it('should throw error when message is already in progress', async () => {
      const userMessage1: Message = {
        id: 'user-msg-1',
        answer: 'First message',
        role: 'user'
      };

      const userMessage2: Message = {
        id: 'user-msg-2',
        answer: 'Second message',
        role: 'user'
      };

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
      const userMessage: Message = {
        id: 'user-msg-error',
        answer: 'This will error',
        role: 'user'
      };

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

      const successMessage: Message = {
        id: 'user-msg-success',
        answer: 'This should work',
        role: 'user'
      };

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

      const userMessage: Message = {
        id: 'user-streaming',
        answer: 'Stream this',
        role: 'user'
      };

      const response = await stateManager.sendMessage(userMessage, { stream: true });

      expect(mockClient.sendMessage).toHaveBeenCalledWith('conv-456', 'Stream this', { stream: true, afterChunk: expect.any(Function) });
      expect(response).toBeDefined();
    });

    it('should throw error when streaming without handler', async () => {
      (mockClient.getDefaultStreamingHandler as jest.Mock).mockReturnValue(undefined);

      const userMessage: Message = {
        id: 'user-streaming-error',
        answer: 'This should fail',
        role: 'user'
      };

      await expect(
        stateManager.sendMessage(userMessage, { stream: true })
      ).rejects.toThrow('Streaming requested but no default streaming handler available in client');

      // Progress flag should be reset
      expect(stateManager.getMessageInProgress()).toBe(false);
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

      const userMessage: Message = {
        id: 'user-progress',
        answer: 'Test progress events',
        role: 'user'
      };

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
      await stateManager.sendMessage({
        id: 'user-1',
        answer: 'First question',
        role: 'user'
      });

      // Send second message
      await stateManager.sendMessage({
        id: 'user-2',
        answer: 'Second question',
        role: 'user'
      });

      // Verify conversation history
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(4); // 2 user + 2 bot messages

      expect(messages[0]).toEqual({
        id: 'user-1',
        answer: 'First question',
        role: 'user'
      });
      expect(messages[1]).toEqual({
        id: 'msg-1',
        answer: 'First response',
        role: 'bot'
      });
      expect(messages[2]).toEqual({
        id: 'user-2',
        answer: 'Second question',
        role: 'user'
      });
      expect(messages[3]).toEqual({
        id: 'msg-2',
        answer: 'Second response',
        role: 'bot'
      });
    });
  });
}); 
