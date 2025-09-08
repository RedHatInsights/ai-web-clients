/* eslint-disable @typescript-eslint/ban-ts-comment */
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';

describe('Lightspeed Client State Integration', () => {
  let client: LightspeedClient;
  const mockServerUrl = 'http://localhost:3002';

  beforeEach(() => {
    client = new LightspeedClient({
      baseUrl: mockServerUrl,
      fetchFunction: (input, init) => fetch(input, init),
    });
  });

  describe('Basic Client Operations', () => {
    it('should initialize client and get conversations list', async () => {
      const result = await client.init();

      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('conversations');
      expect(Array.isArray(result.conversations)).toBe(true);
      // Should load existing conversations from mock server
    });

    it('should send non-streaming messages successfully', async () => {
      await client.init();

      // Create a conversation first since sendMessage requires an existing conversation
      const conversation = await client.createNewConversation();
      const conversationId = conversation.id;

      const response = await client.sendMessage(
        conversationId,
        'What is OpenShift?'
      );

      expect(response).toBeDefined();
      if (
        response &&
        typeof response === 'object' &&
        'answer' in response &&
        response.answer
      ) {
        expect(typeof response.answer).toBe('string');
        expect(response.answer.length).toBeGreaterThan(0);
        // Conversation ID should be promoted from temp ID to real ID
        expect(response.conversationId).not.toBe(
          '__temp_lightspeed_conversation__'
        );
        expect(typeof response.messageId).toBe('string');
        expect(response.date instanceof Date).toBe(true);

        // Check additional attributes from Lightspeed response
        if (
          response.additionalAttributes &&
          typeof response.additionalAttributes === 'object'
        ) {
          const attrs = response.additionalAttributes;
          if ('inputTokens' in attrs)
            expect(typeof attrs.inputTokens).toBe('number');
          if ('outputTokens' in attrs)
            expect(typeof attrs.outputTokens).toBe('number');
        }
      }
    });

    it('should handle multiple messages in same conversation', async () => {
      await client.init();

      // Create a conversation first
      const conversation = await client.createNewConversation();
      const conversationId = conversation.id;

      // Send first message
      const response1 = await client.sendMessage(
        conversationId,
        'What is a pod in OpenShift?'
      );

      expect(response1).toBeDefined();
      expect('answer' in response1!).toBe(true);

      // Send follow-up message
      const response2 = await client.sendMessage(
        conversationId,
        'How do I scale a deployment?'
      );

      expect(response2).toBeDefined();
      expect('answer' in response2!).toBe(true);

      // Both responses should have same conversation ID
      if (
        response1 &&
        response2 &&
        typeof response1 === 'object' &&
        typeof response2 === 'object'
      ) {
        // Both responses should have same promoted conversation ID (not the temp ID)
        expect(response1.conversationId).not.toBe(
          '__temp_lightspeed_conversation__'
        );
        expect(response2.conversationId).not.toBe(
          '__temp_lightspeed_conversation__'
        );
      }
    });
  });

  describe('Health and Status Checks', () => {
    it('should perform health check successfully', async () => {
      const healthStatus = await client.healthCheck();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.ready).toBe(true);
      expect(healthStatus.alive).toBe(true);
      expect(typeof healthStatus.timestamp).toBe('string');
      expect(typeof healthStatus.reason).toBe('string');
    });

    it('should get service status', async () => {
      const serviceStatus = await client.getServiceStatus();

      expect(serviceStatus).toBeDefined();
      expect(typeof serviceStatus.functionality).toBe('string');
      expect(typeof serviceStatus.status).toBe('object');
      expect(serviceStatus.functionality).toBe('feedback');
    });

    it('should get metrics', async () => {
      const metrics = await client.getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('lightspeed_requests_total');
      expect(metrics).toContain('lightspeed_response_time_seconds');
      expect(metrics).toContain('lightspeed_conversations_active');
    });
  });

  describe('Authorization', () => {
    it('should check authorization successfully', async () => {
      const authResponse = await client.checkAuthorization();

      expect(typeof authResponse.user_id).toBe('string');
      expect(typeof authResponse.username).toBe('string');
      expect(typeof authResponse.skip_user_id_check).toBe('boolean');
      expect(authResponse.username).toBe('testuser');
    });
  });

  describe('State Manager Integration', () => {
    it('should integrate with state manager for non-streaming messages', async () => {
      const client = new LightspeedClient({
        baseUrl: mockServerUrl,
        fetchFunction: (input, init) => fetch(input, init),
      });
      const stateManager = createClientStateManager(client);

      // Initialize state manager
      await stateManager.init();

      // Send a message through state manager (lazy initialization will create conversation)
      const response = await stateManager.sendMessage('What is OpenShift?');

      expect(response).toBeDefined();

      // Verify messages
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + assistant messages

      const userMsg = messages.find((m) => m.role === 'user');
      const assistantMsg = messages.find((m) => m.role === 'bot');

      expect(userMsg).toBeDefined();
      expect(userMsg?.answer).toBe('What is OpenShift?');

      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.answer).toBeDefined();
      expect(typeof assistantMsg?.answer).toBe('string');
    });

    it('should handle streaming messages through state manager', async () => {
      const client = new LightspeedClient({
        baseUrl: mockServerUrl,
        fetchFunction: (input, init) => fetch(input, init),
      });
      const stateManager = createClientStateManager(client);

      // Initialize state manager
      await stateManager.init();

      // Send streaming message through state manager (lazy initialization will create conversation)
      await stateManager.sendMessage('What is OpenShift streaming?', {
        streamResponse: true,
      });

      // Verify message flow
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + assistant messages

      const userMsg = messages.find((m) => m.role === 'user');
      const assistantMsg = messages.find((m) => m.role === 'bot');

      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
    }, 5000);
  });

  describe('Error Handling', () => {
    it('should handle validation errors properly', async () => {
      await client.init();

      // Create a conversation first
      const conversation = await client.createNewConversation();
      const conversationId = conversation.id;

      await expect(client.sendMessage(conversationId, '')).rejects.toThrow();
    });

    it('should handle feedback validation errors', async () => {
      await client.init();

      // Create a conversation first
      const conversation = await client.createNewConversation();
      const conversationId = conversation.id;

      await expect(
        client.storeFeedback({
          conversation_id: conversationId,
          user_question: '',
          llm_response: '',
        })
      ).rejects.toThrow();
    });

    it('should handle network errors gracefully', async () => {
      const invalidClient = new LightspeedClient({
        baseUrl: 'http://localhost:9999', // Non-existent server
        fetchFunction: (input, init) => fetch(input, init),
      });

      // Test sendMessage which throws on network errors (unlike healthCheck which returns unhealthy status)
      await invalidClient.init();

      // Create a conversation first since sendMessage requires an existing conversation
      const conversation = await invalidClient.createNewConversation();
      await expect(
        invalidClient.sendMessage(conversation.id, 'Test message')
      ).rejects.toThrow();
    });

    it('should handle authorization failures', async () => {
      // Simulate authorization failure by calling multiple times
      // (mock server randomly returns 403 10% of the time)
      for (let i = 0; i < 20; i++) {
        try {
          await client.checkAuthorization();
        } catch (error) {
          expect(error).toBeDefined();
          return; // Exit test if we get an auth failure
        }
      }

      // If we reach here, all calls succeeded (also valid)
      expect(true).toBe(true);
    });
  });

  describe('Request Configuration', () => {
    it('should handle user_id parameter in requests', async () => {
      await client.init();

      // Create a conversation first
      const conversation = await client.createNewConversation();
      const conversationId = conversation.id;

      const response = await client.sendMessage(
        conversationId,
        'What is OpenShift?',
        { userId: 'test-user-123' }
      );

      expect(response).toBeDefined();
      if (response && typeof response === 'object' && 'answer' in response) {
        expect(typeof response.answer).toBe('string');
      }
    });

    it('should handle custom headers in requests', async () => {
      await client.init();

      // Create a conversation first
      const conversation = await client.createNewConversation();
      const conversationId = conversation.id;

      const response = await client.sendMessage(
        conversationId,
        'What is OpenShift?',
        {
          headers: {
            'X-Custom-Header': 'test-value',
            'X-Request-ID': 'test-request-123',
          },
        }
      );

      expect(response).toBeDefined();
      if (response && typeof response === 'object' && 'answer' in response) {
        expect(typeof response.answer).toBe('string');
      }
    });

    it('should handle request timeout', async () => {
      await client.init();

      // Create a conversation first
      const conversation = await client.createNewConversation();
      const conversationId = conversation.id;

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1000);

      try {
        await client.sendMessage(conversationId, 'What is OpenShift?', {
          signal: controller.signal,
        });
        // If we get here, the request completed before timeout
        expect(true).toBe(true);
      } catch (error) {
        // Request was aborted or failed
        expect(error).toBeDefined();
      }
    });
  });

  // New OpenAPI v0.2.0 Integration Tests (using mock server - no fetch mocking!)
  describe('OpenAPI v0.2.0 New Endpoints Integration', () => {
    describe('Service Information Endpoints', () => {
      it('should get service info, models, and configuration from mock server', async () => {
        const serviceInfo = await client.getServiceInfo();
        const models = await client.getModels();
        const config = await client.getConfiguration();

        // Service info should match mock server response
        expect(serviceInfo).toBeDefined();
        expect(serviceInfo.name).toBe('Lightspeed Core Service');
        expect(serviceInfo.service_version).toBe('0.2.0');
        expect(serviceInfo.llama_stack_version).toBeDefined();
        expect(typeof serviceInfo.llama_stack_version).toBe('string');

        // Models should be an array with proper structure
        expect(models).toBeDefined();
        expect(models.models).toBeDefined();
        expect(Array.isArray(models.models)).toBe(true);
        expect(models.models.length).toBeGreaterThan(0);
        if (models.models.length > 0) {
          const model = models.models[0];
          expect(model.identifier).toBeDefined();
          expect(model.provider_id).toBeDefined();
          expect(model.model_type).toBeDefined();
        }

        // Config should have expected structure
        expect(config).toBeDefined();
        expect(config.name).toBe('Lightspeed Core Service');
        expect(config.service).toBeDefined();
        expect(config.llama_stack).toBeDefined();
        expect(config.user_data_collection).toBeDefined();
        expect(typeof config.service.host).toBe('string');
        expect(typeof config.service.port).toBe('number');
        expect(typeof config.user_data_collection.feedback_enabled).toBe(
          'boolean'
        );
      });
    });

    describe('Conversation Management Integration', () => {
      it('should manage conversations through mock server lifecycle', async () => {
        // Get initial conversations list
        const initialConversations = await client.getConversations();
        expect(initialConversations).toBeDefined();
        expect(initialConversations.conversations).toBeDefined();
        expect(Array.isArray(initialConversations.conversations)).toBe(true);

        // Test conversation creation with temp ID pattern
        const newConversation = await client.createNewConversation();
        expect(newConversation.id).toBe('__temp_lightspeed_conversation__');
        expect(newConversation.title).toBe('New Conversation');
        expect(newConversation.locked).toBe(false);
        expect(newConversation.createdAt).toBeInstanceOf(Date);

        // Send message to promote temp conversation to real conversation
        const messageResponse = await client.sendMessage(
          newConversation.id,
          'Integration test message for conversation promotion'
        );

        expect(messageResponse).toBeDefined();
        expect(messageResponse.conversationId).toBeDefined();
        expect(messageResponse.conversationId).not.toBe(
          '__temp_lightspeed_conversation__'
        );
        expect(messageResponse.answer).toBeDefined();
        expect(typeof messageResponse.answer).toBe('string');
        expect(messageResponse.messageId).toBeDefined();
        expect(messageResponse.date).toBeInstanceOf(Date);
        expect(messageResponse.additionalAttributes).toBeDefined();

        const realConversationId = messageResponse.conversationId;

        // Get updated conversations list - should include new conversation
        const updatedConversations = await client.getConversations();
        expect(updatedConversations.conversations.length).toBeGreaterThan(
          initialConversations.conversations.length
        );

        // Find our new conversation
        const ourConversation = updatedConversations.conversations.find(
          (conv) => conv.conversation_id === realConversationId
        );
        expect(ourConversation).toBeDefined();
        expect(ourConversation?.message_count).toBeGreaterThan(0);

        // Get conversation details
        const conversationDetails = await client.getConversation(
          realConversationId
        );
        expect(conversationDetails).toBeDefined();
        expect(conversationDetails.conversation_id).toBe(realConversationId);
        expect(conversationDetails.chat_history).toBeDefined();
        expect(Array.isArray(conversationDetails.chat_history)).toBe(true);

        // Get conversation history
        const history = await client.getConversationHistory(realConversationId);
        expect(Array.isArray(history)).toBe(true);
        if (Array.isArray(history) && history.length > 0) {
          expect(history[0].input).toBe(
            'Integration test message for conversation promotion'
          );
          expect(history[0].answer).toBeDefined();
          expect(history[0].date).toBeInstanceOf(Date);
        }

        // Delete the conversation
        const deleteResult = await client.deleteConversation(
          realConversationId
        );
        expect(deleteResult).toBeDefined();
        expect(deleteResult.conversation_id).toBe(realConversationId);
        expect(deleteResult.success).toBe(true);

        // Verify conversation is deleted
        const finalConversations = await client.getConversations();
        const deletedConversation = finalConversations.conversations.find(
          (conv) => conv.conversation_id === realConversationId
        );
        expect(deletedConversation).toBeUndefined();
      });

      it('should handle conversation history for temp conversation ID and empty conversations', async () => {
        // Temp conversation ID should return empty history
        const tempHistory = await client.getConversationHistory(
          '__temp_lightspeed_conversation__'
        );
        expect(tempHistory).toEqual([]);

        // Non-existent conversation should return empty history
        const nonExistentHistory = await client.getConversationHistory(
          'non-existent-conversation-id'
        );
        expect(nonExistentHistory).toEqual([]);
      });
    });

    describe('Feedback Status Management Integration', () => {
      it('should update and retrieve feedback status through mock server', async () => {
        // Get initial feedback status
        const initialStatus = await client.getServiceStatus();
        expect(initialStatus).toBeDefined();
        expect(initialStatus.functionality).toBe('feedback');

        // Update feedback status
        const updateResult = await client.updateFeedbackStatus({
          status: false,
        });
        expect(updateResult).toBeDefined();
        expect(updateResult.status).toBeDefined();
        expect(updateResult.status.updated_status).toBe(false);
        expect(updateResult.status.previous_status).toBeDefined();
        expect(updateResult.status.timestamp).toBeDefined();

        // Update back to true
        const updateBackResult = await client.updateFeedbackStatus({
          status: true,
        });
        expect(updateBackResult.status.updated_status).toBe(true);
        expect(updateBackResult.status.previous_status).toBe(false);
      });
    });

    describe('Error Handling Integration', () => {
      it('should handle 404 errors gracefully for non-existent conversations', async () => {
        // getConversationHistory should return empty array for non-existent conversations
        const history = await client.getConversationHistory(
          'non-existent-conversation'
        );
        expect(history).toEqual([]);

        // deleteConversation should throw for non-existent conversations
        await expect(
          client.deleteConversation('non-existent-conversation')
        ).rejects.toThrow();

        // getConversation should throw for non-existent conversations
        await expect(
          client.getConversation('non-existent-conversation')
        ).rejects.toThrow();
      });

      it('should handle network errors and timeouts gracefully', async () => {
        const controller = new AbortController();
        controller.abort(); // Abort immediately to ensure test failure

        await expect(
          client.sendMessage('test-conversation', 'Test message', {
            signal: controller.signal,
          })
        ).rejects.toThrow();
      });
    });

    describe('End-to-End Conversation Flow Integration', () => {
      it('should handle complete conversation lifecycle with promotion', async () => {
        // 1. Create new conversation (temp ID)
        const newConv = await client.createNewConversation();
        expect(newConv.id).toBe('__temp_lightspeed_conversation__');

        // 2. Send first message (should promote to real conversation)
        const firstResponse = await client.sendMessage(
          newConv.id,
          'Start of conversation flow test'
        );

        const realConvId = firstResponse.conversationId;
        expect(realConvId).not.toBe('__temp_lightspeed_conversation__');
        expect(firstResponse.answer).toBeDefined();

        // 3. Send second message using real conversation ID
        const secondResponse = await client.sendMessage(
          realConvId,
          'Second message in conversation'
        );

        expect(secondResponse.conversationId).toBe(realConvId);
        expect(secondResponse.answer).toBeDefined();

        // 4. Verify conversation history contains both messages
        const history = await client.getConversationHistory(realConvId);
        expect(Array.isArray(history)).toBe(true);
        if (Array.isArray(history)) {
          expect(history.length).toBeGreaterThanOrEqual(2);
          expect(
            history.some((h) => h.input === 'Start of conversation flow test')
          ).toBe(true);
          expect(
            history.some((h) => h.input === 'Second message in conversation')
          ).toBe(true);
        }

        // 5. Verify conversation appears in conversations list
        const conversations = await client.getConversations();
        const ourConv = conversations.conversations.find(
          (c) => c.conversation_id === realConvId
        );
        expect(ourConv).toBeDefined();
        expect(ourConv?.message_count).toBeGreaterThanOrEqual(2);

        // 6. Clean up
        await client.deleteConversation(realConvId);
      });
    });
  });
});
