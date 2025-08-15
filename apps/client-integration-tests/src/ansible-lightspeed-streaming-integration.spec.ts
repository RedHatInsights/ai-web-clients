import { AnsibleLightspeedClient } from '@redhat-cloud-services/ansible-lightspeed';
import type {
  AnsibleLightspeedConfig,
  AnsibleLightspeedMessageAttributes,
} from '@redhat-cloud-services/ansible-lightspeed';
import {
  createClientStateManager,
  StateManager,
} from '@redhat-cloud-services/ai-client-state';

/**
 * Ansible Lightspeed Streaming Integration Tests
 *
 * These tests use the Ansible Lightspeed mock server for real streaming integration testing.
 * The mock server must be running at http://localhost:3003 for these tests to pass.
 *
 * Start the mock server with: node ansible-lightspeed-mock-server.js
 *
 * All tests interact exclusively through the state manager interface to reflect real usage patterns.
 */
describe('Ansible Lightspeed Streaming Integration Tests', () => {
  let stateManager: StateManager<AnsibleLightspeedMessageAttributes>;
  const mockServerUrl = 'http://localhost:3003';

  // Helper functions for common test patterns
  const sendStreamingMessage = async (message: string) => {
    return stateManager.sendMessage(message, { stream: true });
  };

  const sendNonStreamingMessage = async (message: string) => {
    return stateManager.sendMessage(message, { stream: false });
  };

  const verifyUserMessage = (
    messages: any[],
    index: number,
    expectedContent: string
  ) => {
    expect(messages[index].role).toBe('user');
    expect(messages[index].answer).toBe(expectedContent);
  };

  const verifyBotMessage = (messages: any[], index: number) => {
    expect(messages[index].role).toBe('bot');
    expect(messages[index].answer).toBeTruthy();
  };

  const verifyBasicConversation = (
    expectedUserMessage: string,
    expectedMinMessages = 2
  ) => {
    const messages = stateManager.getActiveConversationMessages();
    expect(messages.length).toBeGreaterThanOrEqual(expectedMinMessages);
    verifyUserMessage(messages, messages.length - 2, expectedUserMessage);
    verifyBotMessage(messages, messages.length - 1);
  };

  const getActiveMessages = () => stateManager.getActiveConversationMessages();

  beforeEach(async () => {
    const config: AnsibleLightspeedConfig = {
      baseUrl: mockServerUrl,
      fetchFunction: (...args) => fetch(...args),
    };

    const client = new AnsibleLightspeedClient(config);
    stateManager = createClientStateManager(client);
    await stateManager.init();
  });

  beforeAll(async () => {
    // Check if mock server is running
    try {
      const response = await fetch(`${mockServerUrl}/v1/info`);
      if (!response.ok) {
        throw new Error('Mock server not responding');
      }
    } catch (error) {
      throw new Error(
        `Mock server not running at ${mockServerUrl}. Start it with: node ansible-lightspeed-mock-server.js`
      );
    }
  });

  describe('Streaming Response Handling via State Manager', () => {
    it('should handle streaming responses and conversation state', async () => {
      const message = 'How do I use Ansible modules?';

      const result = await sendStreamingMessage(message);

      // Verify streaming returns void
      expect(result).toBeUndefined();

      // Check current state after streaming
      const currentState = stateManager.getState();
      expect(currentState.activeConversationId).toBeDefined();

      // Verify conversation structure
      verifyBasicConversation(message);
    });

    it('should handle conversation_id management through state manager', async () => {
      const message = 'How do I install packages with Ansible?';

      // First send a message to trigger lazy initialization
      await sendStreamingMessage(message);

      // Now conversation ID should be set
      const conversationId = stateManager.getActiveConversationId();
      expect(conversationId).toBeTruthy();
      expect(typeof conversationId).toBe('string');
      expect(conversationId).not.toBe('__temp_conversation__'); // Should be promoted

      // Send another message to the same conversation
      await sendStreamingMessage('Follow up question');

      const currentConversationId = stateManager.getActiveConversationId();
      expect(currentConversationId).toBe(conversationId);

      expect(getActiveMessages().length).toBeGreaterThanOrEqual(4); // 2 user + 2 bot messages
    });
  });

  describe('Multiple Conversations via State Manager', () => {
    it('should handle multiple streaming messages in same conversation', async () => {
      const initialMessageCount = getActiveMessages().length || 0;

      await sendStreamingMessage('First message about files');
      await sendStreamingMessage('Second message about users');

      const messages = getActiveMessages();
      expect(messages.length).toBeGreaterThanOrEqual(initialMessageCount + 4);
      expect(messages.length).toEqual(4);

      verifyUserMessage(messages, 0, 'First message about files');
      verifyBotMessage(messages, 1);
      verifyUserMessage(messages, 2, 'Second message about users');
      verifyBotMessage(messages, 3);
    }, 10_000);
  });

  describe('ReferencedDocument Integration via State Manager', () => {
    it('should handle streaming requests with mock server integration', async () => {
      const message = 'How do I manage files with Ansible?';

      const result = await sendStreamingMessage(message);
      expect(result).toBeUndefined();

      verifyBasicConversation(message);
    });

    it('should handle non-streaming messages through state manager', async () => {
      const message = 'How do I copy files with Ansible?';

      const result = await sendNonStreamingMessage(message);

      expect(result).toBeDefined();
      expect(result.answer).toBeTruthy();
      expect(result.messageId).toBeDefined();
      expect(result.additionalAttributes).toBeDefined();

      const messages = getActiveMessages();
      expect(messages.length).toEqual(2);
      verifyUserMessage(messages, 0, message);
      verifyBotMessage(messages, 1);
    });

    it('should maintain conversation state during streaming', async () => {
      const initialMessageCount = getActiveMessages().length;
      expect(initialMessageCount).toBeGreaterThanOrEqual(0);

      await sendStreamingMessage('First message');
      const afterFirstMessage = getActiveMessages().length;
      expect(afterFirstMessage).toBeGreaterThan(initialMessageCount);

      await sendStreamingMessage('Second message');
      const afterSecondMessage = getActiveMessages().length;
      expect(afterSecondMessage).toBeGreaterThan(afterFirstMessage);

      const messages = getActiveMessages();
      expect(messages.length).toEqual(4);
      verifyUserMessage(messages, 0, 'First message');
      verifyBotMessage(messages, 1);
      verifyUserMessage(messages, 2, 'Second message');
      verifyBotMessage(messages, 3);
    }, 10_000);

    it('should validate streaming integration with mock server', async () => {
      const message = 'Show me Ansible module documentation with references';

      await sendStreamingMessage(message);

      const messages = getActiveMessages();
      expect(messages.length).toEqual(2);

      verifyUserMessage(messages, 0, message);
      expect(messages[0].id).toBeDefined();
    });
  });
});
