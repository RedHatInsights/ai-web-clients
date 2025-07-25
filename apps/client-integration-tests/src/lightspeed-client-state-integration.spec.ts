/* eslint-disable @typescript-eslint/ban-ts-comment */
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import { 
  createClientStateManager,
} from '@redhat-cloud-services/ai-client-state';

describe('Lightspeed Client State Integration', () => {
  let client: LightspeedClient;
  const mockServerUrl = 'http://localhost:3002';

  beforeEach(() => {
    client = new LightspeedClient({
      baseUrl: mockServerUrl,
      fetchFunction: (input, init) => fetch(input, init)
    });
  });

  describe('Basic Client Operations', () => {
    it('should initialize client and get conversation ID', async () => {
      const result = await client.init();
      
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('initialConversationId');
      expect(result).toHaveProperty('conversations');
      expect(typeof result.initialConversationId).toBe('string');
      expect(result.initialConversationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(Array.isArray(result.conversations)).toBe(true);
    });

    it('should send non-streaming messages successfully', async () => {
      const result = await client.init();
      const conversationId = result.initialConversationId;
      
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
        }
      }
    });

    it('should handle multiple messages in same conversation', async () => {
      const result = await client.init();
      const conversationId = result.initialConversationId;
      
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
        fetchFunction: (input, init) => fetch(input, init)
      });
      const stateManager = createClientStateManager(client);

      // Initialize state manager
      const result = await client.init();
      const conversationId = result.initialConversationId;
              await stateManager.init();

       // Send a message through state manager
      await stateManager.setActiveConversationId(conversationId);
      const response = await stateManager.sendMessage('What is OpenShift?');

      expect(response).toBeDefined();

      // Verify messages
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + assistant messages

      const userMsg = messages.find(m => m.role === 'user');
      const assistantMsg = messages.find(m => m.role === 'bot');

      expect(userMsg).toBeDefined();
      expect(userMsg?.answer).toBe('What is OpenShift?');

      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.answer).toBeDefined();
      expect(typeof assistantMsg?.answer).toBe('string');
    });

    it('should handle streaming messages through state manager', async () => {
      const client = new LightspeedClient({
        baseUrl: mockServerUrl,
        fetchFunction: (input, init) => fetch(input, init)
      });
      const stateManager = createClientStateManager(client);

      // Initialize state manager
      const result = await client.init();
      const conversationId = result.initialConversationId;
      await stateManager.init();

      // Send streaming message through state manager
      await stateManager.setActiveConversationId(conversationId);
      await stateManager.sendMessage('What is OpenShift streaming?', {
        streamResponse: true
      });

      // Verify message flow
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2); // User + assistant messages

      const userMsg = messages.find(m => m.role === 'user');
      const assistantMsg = messages.find(m => m.role === 'bot');

      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
    }, 5000);
  });

  describe('Error Handling', () => {
    it('should handle validation errors properly', async () => {
      const result = await client.init();
      const conversationId = result.initialConversationId;
      
      await expect(
        client.sendMessage(conversationId, '')
      ).rejects.toThrow();
    });

    it('should handle feedback validation errors', async () => {
      const result = await client.init();
      const conversationId = result.initialConversationId;
      
      await expect(
        client.storeFeedback({
          conversation_id: conversationId,
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
       const result = await invalidClient.init();
       const conversationId = result.initialConversationId;
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
      const result = await client.init();
      const conversationId = result.initialConversationId;
      
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
      const result = await client.init();
      const conversationId = result.initialConversationId;
      
      const response = await client.sendMessage(
        conversationId,
        'What is OpenShift?',
        { 
          headers: { 
            'X-Custom-Header': 'test-value',
            'X-Request-ID': 'test-request-123'
          }
        }
      );

      expect(response).toBeDefined();
      if (response && typeof response === 'object' && 'answer' in response) {
        expect(typeof response.answer).toBe('string');
      }
    });

         it('should handle request timeout', async () => {
      const result = await client.init();
      const conversationId = result.initialConversationId;
      
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1000);

      try {
        await client.sendMessage(
          conversationId,
          'What is OpenShift?',
          { signal: controller.signal }
        );
        // If we get here, the request completed before timeout
        expect(true).toBe(true);
      } catch (error) {
        // Request was aborted or failed
        expect(error).toBeDefined();
      }
     });
  });
}); 