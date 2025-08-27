/**
 * AAI Client + State Manager Integration Tests
 *
 * Tests the @redhat-cloud-services/aai-client package integrated with
 * @redhat-cloud-services/ai-client-state for end-to-end workflows.
 */

import { AAIClient } from '@redhat-cloud-services/aai-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

describe('AAI Client + State Manager Integration Tests', () => {
  let client: AAIClient;
  let stateManager: ReturnType<typeof createClientStateManager>;
  const mockServerUrl = 'http://localhost:3004';

  beforeEach(() => {
    client = new AAIClient({
      baseUrl: mockServerUrl,
    });
    stateManager = createClientStateManager(client);
  });

  beforeAll(async () => {
    // Health check to ensure mock server is running
    try {
      const response = await fetch(
        `${mockServerUrl}/api/v1/health/status/chatbot/`
      );
      if (!response.ok) {
        throw new Error('Mock server not responding');
      }
    } catch (error) {
      throw new Error(
        `AAI mock server not running at ${mockServerUrl}. Start it with: node aai-mock-server.js`
      );
    }
  });

  describe('State Manager Initialization', () => {
    it('should initialize state manager with AAI client', async () => {
      await stateManager.init();

      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.getConversations()).toEqual([]);
    });

    it('should handle lazy conversation creation', async () => {
      await stateManager.init();

      // Initially should not be temporary (no conversation at all yet)
      expect(stateManager.isTemporaryConversation()).toBe(false);

      // Temporary conversation is created automatically during sendMessage if needed
      // This is consistent with how other clients work (ARH, etc.)
    });
  });

  describe('End-to-End Message Flow', () => {
    it('should handle complete message flow with conversation promotion', async () => {
      await stateManager.init();

      // Initially no active conversation
      expect(stateManager.isTemporaryConversation()).toBe(false);

      // Send first message - should auto-promote temporary conversation
      const response = await stateManager.sendMessage(
        'How do I get started with Ansible?',
        {
          stream: true,
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'How do I get started with Ansible?',
          },
        }
      );

      // Verify response
      expect(response).toBeDefined();

      // After first message, should no longer be temporary
      expect(stateManager.isTemporaryConversation()).toBe(false);
      expect(stateManager.getActiveConversationId()).not.toBe(
        '__temp_conversation__'
      );

      // Verify messages are stored
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2); // User message + bot response

      const userMessage = messages.find((m) => m.role === 'user');
      const botMessage = messages.find((m) => m.role === 'bot');

      expect(userMessage).toMatchObject({
        role: 'user',
        answer: 'How do I get started with Ansible?',
      });

      expect(botMessage).toMatchObject({
        role: 'bot',
        answer: expect.stringContaining('Ansible'),
      });
    });

    it('should handle multiple messages in same conversation', async () => {
      await stateManager.init();

      // Send first message
      await stateManager.sendMessage('What is Ansible?', {
        stream: true,
        requestBody: {
          model: 'gemini/gemini-2.5-flash',
          provider: 'gemini',
          query: 'What is Ansible?',
        },
      });

      const conversationId = stateManager.getActiveConversationId();

      // Send second message
      await stateManager.sendMessage('How do I install it?', {
        stream: true,
        requestBody: {
          model: 'gemini/gemini-2.5-flash',
          provider: 'gemini',
          query: 'How do I install it?',
        },
      });

      // Should remain in same conversation
      expect(stateManager.getActiveConversationId()).toBe(conversationId);

      // Should have 4 messages total (2 user + 2 bot)
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(4);
    });

    it('should handle streaming responses through state manager', async () => {
      await stateManager.init();

      // Send message with streaming enabled - state manager handles handleChunk internally
      await stateManager.sendMessage('Tell me about Ansible playbooks', {
        stream: true,
        requestBody: {
          model: 'gemini/gemini-2.5-flash',
          provider: 'gemini',
          query: 'Tell me about Ansible playbooks',
        },
      });

      // Verify messages are in state manager
      const messages = stateManager.getActiveConversationMessages();
      expect(messages).toHaveLength(2); // User message + bot response

      const userMessage = messages.find((m) => m.role === 'user');
      const botMessage = messages.find((m) => m.role === 'bot');

      expect(userMessage).toMatchObject({
        role: 'user',
        answer: 'Tell me about Ansible playbooks',
      });

      expect(botMessage).toMatchObject({
        role: 'bot',
        answer: expect.stringContaining('Ansible'), // Should contain Ansible-related content
      });
    });
  });

  describe('Conversation Management', () => {
    // AAI will only ever have one active conversation for now
    it('should create new conversation on first message', async () => {
      await stateManager.init();

      // Start with no conversations (temporary only)
      expect(stateManager.getConversations()).toHaveLength(0);
      // Send first message - creates first conversation
      await stateManager.sendMessage('Create first conversation', {
        stream: true,
        requestBody: {
          model: 'gemini/gemini-2.5-flash',
          provider: 'gemini',
          query: 'Create first conversation',
        },
      });

      // Should have 1 conversation
      expect(stateManager.getConversations()).toHaveLength(1);
      expect(stateManager.getActiveConversationId()).not.toBe(
        '__aai_temp_conversation__'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle streaming errors gracefully', async () => {
      await stateManager.init();

      await expect(
        stateManager.sendMessage('This should fail', {
          stream: true,
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'This should fail',
          },
          headers: {
            'x-mock-error-after-chunks': '1',
            'x-mock-error-message': 'Integration test error',
          },
        })
      ).rejects.toThrow();
    });

    it('should handle validation errors', async () => {
      await stateManager.init();

      await expect(
        stateManager.sendMessage('Invalid request', {
          stream: true,
          requestBody: {
            // Missing required fields
            query: 'Invalid request',
          } as any,
        })
      ).rejects.toThrow('API request failed: 422 Unprocessable Entity');
    });

    it('should throw if non streaming message is sent', async () => {
      await stateManager.init();

      await expect(
        stateManager.sendMessage('Non streaming message', {
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            query: 'Non streaming message',
          },
        })
      ).rejects.toThrow(
        'Non-streaming sendMessage is not supported in AAI client'
      );
    });
  });

  describe('State Persistence', () => {
    it('should maintain state across operations', async () => {
      await stateManager.init();

      // Send initial message
      await stateManager.sendMessage('Initial message', {
        stream: true,
        requestBody: {
          model: 'gemini/gemini-2.5-flash',
          provider: 'gemini',
          query: 'Initial message',
        },
      });

      const conversationId = stateManager.getActiveConversationId();
      const messages = stateManager.getActiveConversationMessages();

      // Verify state is maintained
      expect(stateManager.getActiveConversationId()).toBe(conversationId);
      expect(stateManager.getActiveConversationMessages()).toEqual(messages);
      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.isTemporaryConversation()).toBe(false);
    });
  });
});
