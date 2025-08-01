/* eslint-disable @typescript-eslint/ban-ts-comment */
/**
 * ARH Client Error Handling Integration Tests
 * 
 * Tests error handling functionality using the ARH mock server with special headers.
 * This file specifically tests initialization errors and state manager error handling
 * with the @redhat-cloud-services/arh-client and @redhat-cloud-services/ai-client-state packages.
 * 
 * Prerequisites: ARH mock server must be running on localhost:3001
 * Start server: npm run arh-mock-server
 */

import { IFDClient } from '@redhat-cloud-services/arh-client';
import { isInitErrorResponse } from '@redhat-cloud-services/ai-client-common';
import { 
  createClientStateManager,
  Events,
} from '@redhat-cloud-services/ai-client-state';

// Custom fetch function that uses the mock server with error headers
const createMockServerFetch = (headers?: Record<string, string>) => {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const mergedInit = {
      ...init,
      headers: {
        ...init?.headers,
        ...headers
      }
    };
    return fetch(url, mergedInit);
  };
};

describe('ARH Client Error Handling Integration Tests', () => {
  const mockServerBaseUrl = 'http://localhost:3001';

  beforeAll(async () => {
    // Verify mock server is running
    try {
      console.log('Testing connection to:', `${mockServerBaseUrl}/api/ask/v1/health`);
      const response = await fetch(`${mockServerBaseUrl}/api/ask/v1/health`);
      console.log('Health check response status:', response.status);
      const healthData = await response.json();
      console.log('Health check data:', healthData);
      
      if (!response.ok) {
        throw new Error(`Mock server health check failed: ${response.status}`);
      }
      console.log('ARH mock server is healthy and ready for error handling tests');
    } catch (error) {
      console.error('Health check failed with error:', error);
      throw new Error(
        'ARH mock server is not running. Start it with: npm run dev:mock:arh'
      );
    }
  }, 10000);

  describe('Client Initialization Error Handling', () => {
    it('should throw IInitErrorResponse when status endpoint returns 403', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true' // Trigger 403 on status endpoint
        })
      });

      try {
        await client.init();
        fail('Expected init to throw an error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
        if (isInitErrorResponse(error)) {
          expect(error.message).toBe('API request failed: 403 Forbidden');
          expect(error.status).toBe(403);
        }
      }
    });

    it('should handle network errors during initialization', async () => {
      const client = new IFDClient({
        baseUrl: 'http://localhost:9999', // Non-existent server
        fetchFunction: (input, init) => fetch(input, init)
      });

      try {
        await client.init();
        fail('Expected init to throw an error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
        if (isInitErrorResponse(error)) {
          expect(error.status).toBe(500);
          expect(error.message).toContain('error');
        }
    }});

    it('should preserve error details in IInitErrorResponse format', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      try {
        await client.init();
        fail('Expected init to throw an error');
      } catch (error) {
        // Verify the error follows the IInitErrorResponse interface
        expect(typeof error).toBe('object');
        expect(error).not.toBeNull();
        // @ts-ignore
        expect('message' in error).toBe(true);
        // @ts-ignore
        expect('status' in error).toBe(true);
        expect(typeof (error as any).message).toBe('string');
        expect(typeof (error as any).status).toBe('number');
        
        // Verify it can be properly identified by type guard
        expect(isInitErrorResponse(error)).toBe(true);
      }
    });
  });

  describe('State Manager Error Handling Integration', () => {
    it('should display error message to user when initialization fails', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      const stateManager = createClientStateManager(client);

      // Subscribe to messages to capture the error
      const messages: any[] = [];
      stateManager.subscribe(Events.MESSAGE, () => {
        const currentMessages = stateManager.getActiveConversationMessages();
        messages.push(...currentMessages);
      });

      try {
        await stateManager.init();
        fail('Expected state manager init to throw an error');
      } catch (error) {
        // Verify the error was thrown
        expect(isInitErrorResponse(error)).toBe(true);
      }

      // Verify the state manager still became initialized (but with error message)
      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.isInitializing()).toBe(false);

      // Verify error message was added to conversation
      const conversationMessages = stateManager.getActiveConversationMessages();
      expect(conversationMessages.length).toBe(1);
      expect(conversationMessages[0].role).toBe('bot');
      expect(conversationMessages[0].answer).toBe('API request failed: 403 Forbidden');
    });

    it('should handle different types of initialization errors gracefully', async () => {
      // Test with network error
      const networkErrorClient = new IFDClient({
        baseUrl: 'http://localhost:9999',
        fetchFunction: (input, init) => fetch(input, init)
      });

      const stateManager = createClientStateManager(networkErrorClient);

      try {
        await stateManager.init();
        fail('Expected network error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
      }

      // Verify state manager handles the error
      expect(stateManager.isInitialized()).toBe(true);
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('bot');
      expect(messages[0].answer.length).toBeGreaterThan(0);
    });

    it('should create conversation context for error messages', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      const stateManager = createClientStateManager(client);

      // Verify no active conversation initially
      expect(stateManager.getActiveConversationId()).toBeNull();

      try {
        await stateManager.init();
        fail('Expected init error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
      }

      // Verify conversation was created for error message
      expect(stateManager.getActiveConversationId()).not.toBeNull();
      expect(stateManager.getActiveConversationId()).toMatch(/^[0-9a-f-]{36}$/); // UUID format

      // Verify conversations list includes the error conversation
      const conversations = stateManager.getConversations();
      expect(conversations.length).toBe(1);
      expect(conversations[0].id).toBe(stateManager.getActiveConversationId());
    });

    it('should emit proper events during error handling', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      const stateManager = createClientStateManager(client);

      // Set up event listeners
      const messageEvents: any[] = [];
      const conversationEvents: any[] = [];
      const initializingEvents: any[] = [];

      stateManager.subscribe(Events.MESSAGE, () => {
        messageEvents.push(stateManager.getActiveConversationMessages());
      });

      stateManager.subscribe(Events.ACTIVE_CONVERSATION, () => {
        conversationEvents.push(stateManager.getActiveConversationId());
      });

      stateManager.subscribe(Events.INITIALIZING_MESSAGES, () => {
        initializingEvents.push(stateManager.isInitializing());
      });

      try {
        await stateManager.init();
        fail('Expected init error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
      }

      // Verify events were emitted
      expect(messageEvents.length).toBeGreaterThan(0);
      expect(conversationEvents.length).toBeGreaterThan(0);
      expect(initializingEvents.length).toBeGreaterThan(0);

      // Verify final state in events
      const finalMessages = messageEvents[messageEvents.length - 1];
      expect(finalMessages.length).toBe(1);
      expect(finalMessages[0].answer).toBe('API request failed: 403 Forbidden');

      const finalConversationId = conversationEvents[conversationEvents.length - 1];
      expect(finalConversationId).not.toBeNull();
    });

    it('should handle error messages with proper JSON formatting for complex errors', async () => {
      // Create a client that will fail during user history fetch (later in init process)
      const conditionalFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        
        // Let health and status pass, but fail on user/current
        if (url.includes('/user/current') && !url.includes('/history')) {
          return new Response(JSON.stringify({ detail: 'Complex error object' }), {
            status: 422,
            statusText: 'Unprocessable Entity',
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return fetch(url, init);
      };

      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: conditionalFetch
      });

      const stateManager = createClientStateManager(client);

      try {
        await stateManager.init();
        fail('Expected init error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
        if (isInitErrorResponse(error)) {
          expect(error.status).toBe(422);
          expect(error.message).toBe('Request validation failed');
        }
      }

      // Verify error message was properly stored
      const messages = stateManager.getActiveConversationMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].answer).toBe('Request validation failed');
    });
  });

  describe('Error Recovery and State Consistency', () => {
    it('should maintain consistent state after initialization errors', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      const stateManager = createClientStateManager(client);

      // Verify initial state
      expect(stateManager.isInitialized()).toBe(false);
      expect(stateManager.isInitializing()).toBe(false);
      expect(stateManager.getActiveConversationId()).toBeNull();

      try {
        await stateManager.init();
        fail('Expected init error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
      }

      // Verify final state is consistent
      expect(stateManager.isInitialized()).toBe(true); // Should be true even after error
      expect(stateManager.isInitializing()).toBe(false); // Should be false after completion
      expect(stateManager.getActiveConversationId()).not.toBeNull(); // Should have conversation for error
      expect(stateManager.getActiveConversationMessages().length).toBe(1); // Should have error message
      expect(stateManager.getConversations().length).toBe(1); // Should have one conversation
    });

    it('should not allow message sending in error state without proper conversation', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      const stateManager = createClientStateManager(client);

      try {
        await stateManager.init();
        fail('Expected init error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
      }

      // Even though there's an active conversation (for error message),
      // trying to send a message to a non-existent conversation should still fail
      await expect(
        stateManager.sendMessage('Test message after error')
      ).rejects.toThrow();
    });

    it('should allow recovery after fixing client configuration', async () => {
      // First, create a client that will fail
      const failingClient = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      const stateManager = createClientStateManager(failingClient);

      try {
        await stateManager.init();
        fail('Expected init error');
      } catch (error) {
        expect(isInitErrorResponse(error)).toBe(true);
      }

      // Verify error state
      expect(stateManager.getActiveConversationMessages()[0].answer).toBe('API request failed: 403 Forbidden');

      // Create a working client and new state manager
      const workingClient = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch() // No error headers
      });

      const newStateManager = createClientStateManager(workingClient);

      // This should succeed
      await newStateManager.init();
      
      // Get actual state to verify
      const conversations = newStateManager.getConversations();
      expect(conversations.length).toBeGreaterThanOrEqual(0);
      
      // Verify working state
      expect(newStateManager.isInitialized()).toBe(true);
      expect(newStateManager.isInitializing()).toBe(false);
    });
  });

  describe('Type Guard Validation', () => {
    it('should properly validate IInitErrorResponse objects', () => {
      // Valid IInitErrorResponse
      const validError = { message: 'Test error', status: 500 };
      expect(isInitErrorResponse(validError)).toBe(true);

      // Invalid objects
      expect(isInitErrorResponse(null)).toBe(false);
      expect(isInitErrorResponse(undefined)).toBe(false);
      expect(isInitErrorResponse({})).toBe(false);
      expect(isInitErrorResponse({ message: 'Test' })).toBe(false); // Missing status
      expect(isInitErrorResponse({ status: 500 })).toBe(false); // Missing message
      expect(isInitErrorResponse({ message: 123, status: 500 })).toBe(false); // Wrong message type
      expect(isInitErrorResponse({ message: 'Test', status: 'error' })).toBe(false); // Wrong status type
      expect(isInitErrorResponse(new Error('Regular error'))).toBe(false); // Regular Error object
      expect(isInitErrorResponse('string error')).toBe(false); // String
      expect(isInitErrorResponse(42)).toBe(false); // Number
    });

    it('should work with real error objects thrown by client', async () => {
      const client = new IFDClient({
        baseUrl: mockServerBaseUrl,
        fetchFunction: createMockServerFetch({
          'x-mock-unauthorized': 'true'
        })
      });

      try {
        await client.init();
        fail('Expected error');
      } catch (error) {
        // Verify the thrown error is properly formatted
        expect(isInitErrorResponse(error)).toBe(true);
        
        // Verify type narrowing works
        if (isInitErrorResponse(error)) {
          expect(typeof error.message).toBe('string');
          expect(typeof error.status).toBe('number');
          expect(error.message.length).toBeGreaterThan(0);
          expect(error.status).toBeGreaterThan(0);
        }
      }
    });
  });
});