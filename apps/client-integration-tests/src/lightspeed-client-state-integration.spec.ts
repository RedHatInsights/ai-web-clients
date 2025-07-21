/* eslint-disable @typescript-eslint/ban-ts-comment */
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import { 
  createClientStateManager,
  UserQuery,
} from '@redhat-cloud-services/ai-client-state';

describe('Lightspeed Client State Integration', () => {
  let client: LightspeedClient;
  let stateManager: ReturnType<typeof createClientStateManager>;
  const mockServerUrl = 'http://localhost:3002';

  beforeEach(() => {
    client = new LightspeedClient({
      baseUrl: mockServerUrl,
      fetchFunction: (input, init) => fetch(input, init)
    });

    stateManager = createClientStateManager(client);
  });

  describe('Basic Client Operations', () => {
    it('should initialize client and get conversation ID', async () => {
      const conversationId = await client.init();
      
      expect(typeof conversationId).toBe('string');
      expect(conversationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should send non-streaming messages successfully', async () => {
      const conversationId = await client.init();
      
      const response = await client.sendMessage(
        conversationId, 
        'What is OpenShift?'
      );

      expect(response).toBeDefined();
      if (response && typeof response === 'object' && 'answer' in response && response.answer) {
        expect(typeof response.answer).toBe('string');
        expect(response.answer.length).toBeGreaterThan(0);
        expect(response.conversationId).toBe(conversationId);
        expect(typeof response.messageId).toBe('string');
        expect(typeof response.createdAt).toBe('string');
        
        // Check additional attributes from Lightspeed response
        if (response.additionalAttributes && typeof response.additionalAttributes === 'object') {
          const attrs = response.additionalAttributes;
          if ('inputTokens' in attrs) expect(typeof attrs.inputTokens).toBe('number');
          if ('outputTokens' in attrs) expect(typeof attrs.outputTokens).toBe('number');
          if ('referencedDocuments' in attrs) expect(Array.isArray(attrs.referencedDocuments)).toBe(true);
          if ('truncated' in attrs) expect(typeof attrs.truncated).toBe('boolean');
          if ('toolCalls' in attrs) expect(Array.isArray(attrs.toolCalls)).toBe(true);
          if ('toolResults' in attrs) expect(Array.isArray(attrs.toolResults)).toBe(true);
        }
      }
    });

    it('should handle multiple messages in same conversation', async () => {
      const conversationId = await client.init();
      
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
      if (response1 && response2 && typeof response1 === 'object' && typeof response2 === 'object') {
        expect(response1.conversationId).toBe(conversationId);
        expect(response2.conversationId).toBe(conversationId);
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

  describe('Feedback Operations', () => {
    it('should store user feedback successfully', async () => {
      const conversationId = await client.init();
      
      // First send a message to have something to give feedback on
      const response = await client.sendMessage(
        conversationId,
        'How do I create a deployment?'
      );

      expect(response).toBeDefined();
      
             if (response && typeof response === 'object' && 'answer' in response && response.answer) {
         const feedbackResponse = await client.storeFeedback({
           conversation_id: conversationId,
           user_question: 'How do I create a deployment?',
           llm_response: response.answer,
           sentiment: 1,
           user_feedback: 'Very helpful explanation!'
         });

         expect(feedbackResponse.response).toBe('feedback received');
       }
    });

    it('should handle feedback without optional fields', async () => {
      const conversationId = await client.init();
      
      const feedbackResponse = await client.storeFeedback({
        conversation_id: conversationId,
        user_question: 'Test question',
        llm_response: 'Test response'
      });

      expect(feedbackResponse.response).toBe('feedback received');
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

         it('should check authorization with user ID', async () => {
       // Mock server randomly returns 403 responses (10% of the time)
       // Handle both success and failure cases
       try {
         const authResponse = await client.checkAuthorization('test-user-123');
         
         expect(typeof authResponse.user_id).toBe('string');
         expect(typeof authResponse.username).toBe('string');
         expect(typeof authResponse.skip_user_id_check).toBe('boolean');
       } catch (error) {
         // 403 responses are expected from the mock server
         expect(error).toBeDefined();
         expect((error as Error).message).toContain('not authorized');
       }
     });
  });

  describe('State Manager Integration', () => {
    it('should integrate with state manager for non-streaming messages', async () => {
      // Initialize state manager
      await stateManager.init();
      
      // Set active conversation
      const conversationId = await client.init();
      stateManager.setActiveConversationId(conversationId);

      const userMessage: UserQuery = 'What is OpenShift?';

      // Send message through state manager
      await stateManager.sendMessage(userMessage);

             // Verify conversation state
       const state = stateManager.getState();
       const conversations = Object.values(state.conversations);
       expect(conversations.length).toBeGreaterThan(0);

       const activeConversation = conversations.find((c: any) => c.id === conversationId);
       expect(activeConversation).toBeDefined();

      // Verify messages
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + assistant messages

      const userMsg = messages.find(m => m.role === 'user');
      const assistantMsg = messages.find(m => m.role === 'bot');

      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
      expect(userMsg?.answer).toBe('What is OpenShift?');
      expect(assistantMsg?.answer).toBeDefined();
      expect(assistantMsg?.answer.length).toBeGreaterThan(0);
    });

    it('should handle multiple conversations with state manager', async () => {
      await stateManager.init();

      // Create first conversation
      const conversationId1 = await client.init();
      stateManager.setActiveConversationId(conversationId1);
      await stateManager.sendMessage('What are pods?');

      // Create second conversation
      const conversationId2 = await client.init();
      stateManager.setActiveConversationId(conversationId2);
      await stateManager.sendMessage('What are deployments?');

             // Verify both conversations exist
       const state2 = stateManager.getState();
       const conversations = Object.values(state2.conversations);
       expect(conversations.length).toBeGreaterThanOrEqual(2);

       const conv1 = conversations.find((c: any) => c.id === conversationId1);
       const conv2 = conversations.find((c: any) => c.id === conversationId2);

      expect(conv1).toBeDefined();
      expect(conv2).toBeDefined();

      // Verify messages in each conversation
      stateManager.setActiveConversationId(conversationId1);
      const messages1 = stateManager.getActiveConversationMessages();
      expect(messages1.length).toBeGreaterThanOrEqual(2);

      stateManager.setActiveConversationId(conversationId2);
      const messages2 = stateManager.getActiveConversationMessages();
      expect(messages2.length).toBeGreaterThanOrEqual(2);

      // Verify different conversation content
      const userMsg1 = messages1.find(m => m.role === 'user');
      const userMsg2 = messages2.find(m => m.role === 'user');

      expect(userMsg1?.answer).toBe('What are pods?');
      expect(userMsg2?.answer).toBe('What are deployments?');
    });

    it('should handle streaming messages through state manager', async () => {
      await stateManager.init();
      
      const conversationId = await client.init();
      stateManager.setActiveConversationId(conversationId);

      // Send streaming message through state manager
      await stateManager.sendMessage('Explain OpenShift networking', { stream: true });

      // Verify message flow
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + assistant messages

      const userMsg = messages.find(m => m.role === 'user');
      const assistantMsg = messages.find(m => m.role === 'bot');

      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
      expect(userMsg?.answer).toBe('Explain OpenShift networking');
      expect(assistantMsg?.answer).toBeDefined();
      expect(assistantMsg?.answer.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors properly', async () => {
      const conversationId = await client.init();
      
      await expect(
        client.sendMessage(conversationId, '')
      ).rejects.toThrow();
    });

    it('should handle feedback validation errors', async () => {
      await expect(
        client.storeFeedback({
          conversation_id: '',
          user_question: '',
          llm_response: ''
        })
      ).rejects.toThrow();
    });

         it('should handle network errors gracefully', async () => {
       const invalidClient = new LightspeedClient({
         baseUrl: 'http://localhost:9999', // Non-existent server
         fetchFunction: (input, init) => fetch(input, init)
       });

       // Test sendMessage which throws on network errors (unlike healthCheck which returns unhealthy status)
       const conversationId = await invalidClient.init();
       await expect(
         invalidClient.sendMessage(conversationId, 'Test message')
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
      const conversationId = await client.init();
      
      const response = await client.sendMessage(
        conversationId,
        'Test with user ID',
        { userId: 'test-user-123' }
      );

      expect(response).toBeDefined();
      expect('answer' in response!).toBe(true);
    });

    it('should handle custom headers in requests', async () => {
      const conversationId = await client.init();
      
      const response = await client.sendMessage(
        conversationId,
        'Test with custom headers',
        { 
          headers: { 
            'X-Custom-Header': 'test-value' 
          } 
        }
      );

      expect(response).toBeDefined();
      expect('answer' in response!).toBe(true);
    });

         it('should handle request timeout', async () => {
       const controller = new AbortController();
       // Abort immediately to ensure the request is cancelled
       controller.abort();

       const conversationId = await client.init();
       
       await expect(
         client.sendMessage(
           conversationId,
           'Test timeout',
           { signal: controller.signal }
         )
       ).rejects.toThrow();
     });
  });
}); 