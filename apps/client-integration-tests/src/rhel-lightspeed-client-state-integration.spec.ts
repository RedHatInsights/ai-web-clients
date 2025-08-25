/**
 * RHEL LightSpeed Client State Integration Tests
 *
 * Tests the RHEL LightSpeed client integration with ai-client-state for
 * conversation management in a RAG-based system.
 */

import { RHELLightspeedClient } from '@redhat-cloud-services/rhel-lightspeed-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

describe('RHEL LightSpeed Client State Integration Tests', () => {
  const MOCK_SERVER_URL = 'http://localhost:3005/api/lightspeed/v1';
  let client: RHELLightspeedClient;
  let stateManager: any;

  beforeEach(() => {
    // Configure the client with native fetch
    client = new RHELLightspeedClient({
      baseUrl: MOCK_SERVER_URL,
      fetchFunction: fetch,
    });

    // Create state manager
    stateManager = createClientStateManager(client);
  });

  afterEach(() => {
    // Clean up any state
    jest.clearAllMocks();
  });

  describe('State Manager Integration', () => {
    it('should create state manager with RHEL LightSpeed client', () => {
      expect(stateManager).toBeDefined();
      expect(typeof stateManager.init).toBe('function');
      expect(typeof stateManager.sendMessage).toBe('function');
      expect(typeof stateManager.createNewConversation).toBe('function');
    });

    it('should initialize state manager with empty conversations (RAG system)', async () => {
      await stateManager.init();

      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.getConversations()).toEqual([]);
    });

    it('should handle lazy initialization pattern', async () => {
      await stateManager.init();

      // State manager should be initialized but no active conversation yet
      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.getActiveConversationId()).toBeNull();

      // First sendMessage should create conversation automatically
      expect(stateManager.isTemporaryConversation()).toBe(false); // No conversation yet
    });
  });

  describe('Conversation Management', () => {
    beforeEach(async () => {
      await stateManager.init();
    });

    it('should create new conversation with client-generated UUID', async () => {
      const conversation = await stateManager.createNewConversation();

      expect(conversation).toEqual({
        id: '__temp_conversation__',
        title: 'New conversation',
        locked: false,
        createdAt: expect.any(Date),
        messages: [],
      });
    });

    it('should set active conversation', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      expect(stateManager.getActiveConversationId()).toBe(conversation.id);
    });

    it('should handle conversation operations', async () => {
      const conv1 = await stateManager.createNewConversation();
      const conv2 = await stateManager.createNewConversation();

      // Both should create the same temp conversation initially
      expect(conv1.id).toBe('__temp_conversation__');
      expect(conv2.id).toBe('__temp_conversation__');

      await stateManager.setActiveConversationId(conv1.id);
      expect(stateManager.getActiveConversationId()).toBe(conv1.id);
    });
  });

  describe('Message Sending with Context', () => {
    beforeEach(async () => {
      await stateManager.init();
    });

    it('should send simple message through state manager', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      // Initially should have temp conversation ID
      expect(stateManager.getActiveConversationId()).toBe(
        '__temp_conversation__'
      );

      const response = await stateManager.sendMessage(
        'How do I check memory in RHEL?'
      );

      expect(response).toBeDefined();
      expect(response.messageId).toBeDefined();
      expect(response.answer).toContain('RHEL');
      expect(response.conversationId).toBe('rhel-lightspeed-conversation');
      expect(response.additionalAttributes?.rag_metadata).toBeDefined();

      // After sending message, should be promoted to real conversation ID
      expect(stateManager.getActiveConversationId()).toBe(
        'rhel-lightspeed-conversation'
      );
    });

    it('should send message with RHEL context through state manager', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      const response = await stateManager.sendMessage(
        'How can I optimize this system?',
        {
          requestPayload: {
            context: {
              systeminfo: {
                os: 'Red Hat Enterprise Linux',
                version: '9.3',
                arch: 'x86_64',
                id: 'test-system',
              },
              terminal: {
                output: 'Load average: 5.2, Memory usage: 85%',
              },
            },
          },
        }
      );

      expect(response).toBeDefined();
      expect(
        response.additionalAttributes?.context_metadata?.has_systeminfo
      ).toBe(true);
      expect(
        response.additionalAttributes?.context_metadata?.has_terminal_output
      ).toBe(true);
    });

    it('should handle skip_rag option through state manager', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      const response = await stateManager.sendMessage('Simple question', {
        requestPayload: {
          skip_rag: true,
        },
      });

      expect(response).toBeDefined();
      expect(response.additionalAttributes?.rag_metadata?.skip_rag).toBe(true);
      expect(response.additionalAttributes?.sources).toEqual([]);
    });
  });

  describe('State Management Events', () => {
    beforeEach(async () => {
      await stateManager.init();
    });

    it('should trigger conversation events', async () => {
      const conversationCallback = jest.fn();
      const unsubscribe = stateManager.subscribe(
        'active-conversation',
        conversationCallback
      );

      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      expect(conversationCallback).toHaveBeenCalled();

      unsubscribe();
    });

    it('should trigger message events', async () => {
      const messageCallback = jest.fn();
      const unsubscribe = stateManager.subscribe('message', messageCallback);

      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      await stateManager.sendMessage('Test message');

      expect(messageCallback).toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await stateManager.init();
    });

    it('should handle client errors gracefully', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      // State manager filters out empty messages before sending to client
      const result = await stateManager.sendMessage('  ');
      expect(result).toBeUndefined(); // State manager returns early for empty messages
    });

    it('should maintain state manager functionality after errors', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      // Trigger error
      try {
        await stateManager.sendMessage('');
      } catch (error) {
        // Error expected
      }

      // State manager should still work
      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.getActiveConversationId()).toBe(conversation.id);

      // Should be able to send valid message
      const response = await stateManager.sendMessage('Valid message');
      expect(response).toBeDefined();
    });
  });

  describe('RAG-Specific State Behavior', () => {
    beforeEach(async () => {
      await stateManager.init();
    });

    it('should handle conversation history correctly (empty for RAG)', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      // Send some messages
      await stateManager.sendMessage('First message');
      await stateManager.sendMessage('Second message');

      // Messages should be stored in state manager, not on server
      // Each sendMessage creates 2 messages: user input + bot response
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(4);

      // But server-side history should remain empty (RAG system)
      // This is handled by the client's getConversationHistory method
    });

    it('should maintain message persistence in single conversation', async () => {
      const conversation = await stateManager.createNewConversation();
      await stateManager.setActiveConversationId(conversation.id);

      // Send first message
      await stateManager.sendMessage('First message');

      // Send second message
      await stateManager.sendMessage('Second message');

      // Check messages are persisted
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(4); // 2 user messages + 2 bot responses
      expect(messages[0].answer).toBe('First message');
      expect(messages[2].answer).toBe('Second message');
    });
  });
});
