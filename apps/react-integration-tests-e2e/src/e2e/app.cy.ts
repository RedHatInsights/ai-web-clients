describe('AI Client Integration E2E Tests', () => {
  let mockServerProcess: any;
  let conversationId: string;

  before(() => {
    // Verify server is running
    cy.request('GET', 'http://localhost:3001/api/ask/v1/health')
      .its('status')
      .should('eq', 200);
  });

  beforeEach(() => {
    // Create a new conversation before each test
    cy.request('POST', 'http://localhost:3001/api/ask/v1/conversation')
      .then((response) => {
        expect(response.status).to.eq(200);
        conversationId = response.body.conversation_id;
        cy.log(`Created new conversation: ${conversationId}`);
      });

    // Visit the app after creating conversation
    cy.visit('/');
    
    // Wait for the app to load and state manager to initialize
    cy.get('#ai-chatbot').should('exist');
    cy.get('#query-input').should('be.visible');
  });

  describe('Initial Application State', () => {
    it('should display the welcome message and chatbot interface', () => {
      // Check page title and heading
      cy.get('#app-heading').should('contain.text', 'Welcome react-integration-tests');
      
      // Check chatbot container is present
      cy.get('#ai-chatbot').should('have.attr', 'aria-label', 'AI Assistant Chatbot');
      
      // Check input area (MessageBar component)
      cy.get('#query-input').should('have.attr', 'aria-label', 'Type your message to the AI assistant');
      
      // Initially should have no messages
      cy.get('[id^="message-"]').should('not.exist');
    });

    it('should have proper accessibility attributes', () => {
      // Check main chatbot accessibility
      cy.get('#ai-chatbot').should('have.attr', 'aria-label', 'AI Assistant Chatbot');
      
      // Check input area accessibility (MessageBar)
      cy.get('#query-input').should('have.attr', 'aria-label', 'Type your message to the AI assistant');
    });
  });

  describe('Message Sending and Receiving', () => {
    it('should send a message and receive a response', () => {
      const testMessage = 'Hello, how can you help me with OpenShift?';
      
      // Find and type in the message input
      cy.get('#query-input').type(testMessage);
      cy.get('[aria-label="Send button"]').click();
      
      // Wait for final state: user message + AI response
      cy.get('[id^="message-"]').should('have.length', 2);
      cy.get('[id^="message-"]').first().should('contain.text', testMessage);
      cy.get('[id^="message-"]').last().should('contain.text', 'OpenShift');
    });

    it('should handle streaming responses correctly', () => {
      const testMessage = 'Tell me about Red Hat container solutions';
      
      // Send message with streaming enabled
      cy.get('#query-input').type(testMessage);
      cy.get('[aria-label="Send button"]').click();
      
      // Wait for final state: user message + AI response
      cy.get('[id^="message-"]').should('have.length', 2);
      cy.get('[id^="message-"]').last().should('contain.text', 'Red Hat');
    });

    it('should display proper message structure and accessibility', () => {
      const testMessage = 'What is Kubernetes?';
      
      cy.get('#query-input').type(testMessage);
      cy.get('[aria-label="Send button"]').click();
      
      // Wait for final state: user message + AI response
      cy.get('[id^="message-"]').should('have.length', 2);
      
      // Check message structure and accessibility
      cy.get('[id^="message-"]').first().get('[aria-label*="Your message"]').should('exist');
      cy.get('[id^="message-"]').last().get('[aria-label*="AI response"]').should('exist');
    });
  });

  describe('Multiple Message Conversations', () => {
    it('should handle multiple messages in a conversation', () => {
      const messages = [
        'Hello, what is OpenShift?',
        'How do I deploy an application?',
        'What about scaling?'
      ];
      
      messages.forEach((message, index) => {
        cy.get('#query-input').clear().type(message);
        cy.get('[aria-label="Send button"]').click();
        
        // Wait for final state: all messages up to this point (user + AI pairs)
        const expectedMessageCount = (index + 1) * 2;
        cy.get('[id^="message-"]').should('have.length', expectedMessageCount);
        
        // Verify the latest user message
        cy.get('[id^="message-"]').eq(-2).should('contain.text', message);
      });
      
      // Verify final conversation state
      cy.get('[id^="message-"]').should('have.length', 6); // 3 user + 3 AI messages
    });

    it('should maintain message order and structure', () => {
      const conversation = [
        { user: 'What is container orchestration?', expectedInResponse: 'container' },
        { user: 'How does it work with Kubernetes?', expectedInResponse: 'Kubernetes' }
      ];
      
      conversation.forEach((turn, index) => {
        cy.get('#query-input').clear().type(turn.user);
        cy.get('[aria-label="Send button"]').click();
        
        // Wait for final state: all messages up to this point
        const expectedCount = (index + 1) * 2;
        cy.get('[id^="message-"]').should('have.length', expectedCount);
        
        // Verify user message and AI response
        cy.get('[id^="message-"]').eq(-2).should('contain.text', turn.user);
        cy.get('[id^="message-"]').eq(-1).should('contain.text', turn.expectedInResponse);
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Ignore expected uncaught exceptions during error handling tests
      cy.on('uncaught:exception', (err, runnable) => {
        // Allow network/API errors to be handled by the component
        if (err.message.includes('fetch') || 
            err.message.includes('network') || 
            err.message.includes('500') ||
            err.message.includes('408') ||
            err.message.includes('timeout') ||
            err.message.includes('Internal server error') ||
            err.message.includes('Request timeout') ||
            err.message.includes('AbortError')) {
          return false;
        }
        // Let other unexpected errors fail the test
      });
    });

    it('should handle API errors gracefully', () => {
      // Intercept the message API call and force it to fail
      cy.intercept('POST', '**/api/ask/v1/conversation/*/message', {
        statusCode: 500,
        body: {
          detail: [{
            loc: ['server'],
            msg: 'Internal server error',
            type: 'server_error'
          }]
        }
      }).as('failedMessage');

      const testMessage = 'This message will trigger an API error';
      
      cy.get('#query-input').type(testMessage);
      cy.get('[aria-label="Send button"]').click();
      
      // Wait for the intercepted API call
      cy.wait('@failedMessage');
      
      // User message should still appear (optimistic UI)
      cy.get('[id^="message-"]').should('have.length', 1);
      cy.get('[id^="message-"]').first().should('contain.text', testMessage);
      
      // No AI response should appear due to the error
      // The application should handle the error gracefully
    });

    // Timeouts are handled with abort controller on the consumer side, so we can't test it here
    it.skip('should handle network timeout errors', () => {
      // Intercept and delay the API call to simulate timeout
      cy.intercept('POST', '**/api/ask/v1/conversation/*/message', {
        delay: 30000, // 30 second delay to simulate timeout
        statusCode: 408,
        body: {
          detail: [{
            loc: ['network'],
            msg: 'Request timeout',
            type: 'timeout_error'
          }]
        }
      }).as('timeoutMessage');

      const testMessage = 'This will timeout';
      
      cy.get('#query-input').type(testMessage);
      cy.get('[aria-label="Send button"]').click();
      
      // User message should appear immediately
      cy.get('[id^="message-"]').should('have.length', 1);
      cy.get('[id^="message-"]').first().should('contain.text', testMessage);
      
      // Should handle timeout gracefully without hanging
    });

    it('should handle empty message submission', () => {
      // Try to submit empty message
      cy.get('#query-input').clear();
      cy.get('[aria-label="Send button"]').click();
      
      // Should not create any messages
      cy.get('[id^="message-"]').should('have.length', 0);
    });
  });

  describe('User Interface Interactions', () => {
    it('should clear input field after sending message', () => {
      const testMessage = 'Test message for input clearing';
      
      const input = cy.get('#query-input');
      input.type(testMessage);
      input.should('have.value', testMessage);
      
      cy.get('[aria-label="Send button"]').click();
      
      // Input should be cleared after sending
      input.should('have.value', '');
    });

    it('should allow keyboard navigation', () => {
      cy.get('#query-input')
        .type('Test keyboard interaction{enter}');
      
      // Message should be sent via Enter key (final state)
      cy.get('[id^="message-"]').should('have.length', 2);
      cy.get('[id^="message-"]').first().should('contain.text', 'Test keyboard interaction');
    });

    it('should handle special characters and long messages', () => {
      const specialMessage = 'Test with special chars: @#$%^&*()_+{}|:"<>?[]\\;\',./ and émojis 🚀';
      const longMessage = 'This is a very long message that tests how the application handles lengthy user input and ensures that it processes correctly without truncation or other issues. '.repeat(3);
      
      [specialMessage, longMessage].forEach((message, index) => {
        cy.get('#query-input').clear().type(message);
        cy.get('[aria-label="Send button"]').click();
        
        // Wait for final state
        const expectedCount = (index + 1) * 2;
        cy.get('[id^="message-"]').should('have.length', expectedCount);
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should update message display during streaming', () => {
      const testMessage = 'Tell me about Red Hat Enterprise Linux features';
      
      cy.get('#query-input').type(testMessage);
      cy.get('[aria-label="Send button"]').click();
      
      // Wait for final state: user message + AI response
      cy.get('[id^="message-"]').should('have.length', 2);
      
      // Verify the AI response has content
      cy.get('[id^="message-"]').last().should('not.be.empty');
    });

    it('should maintain scroll position and message visibility', () => {
      // Send multiple messages to create scrollable content
      for (let i = 1; i <= 5; i++) {
        cy.get('#query-input')
          .clear()
          .type(`Message number ${i} to test scrolling behavior`);
        cy.get('[aria-label="Send button"]').click();
        
        // Wait for final state after each message
        cy.get('[id^="message-"]').should('have.length', i * 2);
      }
      
      // Verify all messages are present and latest is visible
      cy.get('[id^="message-"]').should('have.length', 10);
      cy.get('[id^="message-"]').last().should('be.visible');
    });
  });
})

