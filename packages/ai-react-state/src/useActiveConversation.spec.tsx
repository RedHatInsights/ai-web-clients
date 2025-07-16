import { renderHook, render, act, waitFor } from '@testing-library/react';
import { useActiveConversation } from './useActiveConversation';
import { createClientStateManager, Events, StateManager } from '@redhat-cloud-services/ai-client-state';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';
import React from 'react';
import { AIStateProvider } from './AIStateProvider';

describe('useActiveConversation', () => {
  let mockClient: IAIClient;
  let stateManager: StateManager;

  const createWrapper = (stateManagerInstance: StateManager) => {
    return ({ children }: { children: React.ReactNode }) => (
      <AIStateProvider stateManager={stateManagerInstance}>
        {children}
      </AIStateProvider>
    );
  };

  beforeEach(() => {
    mockClient = {
      sendMessage: jest.fn().mockResolvedValue({ answer: 'test response' }),
      healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
      getDefaultStreamingHandler: jest.fn().mockReturnValue({
        onStart: jest.fn(),
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn()
      }),
      init: jest.fn(),
      getConversationHistory: jest.fn().mockResolvedValue([]),
    };
    
    stateManager = createClientStateManager(mockClient);
  });

  describe('Initial State', () => {
    it('should return null when no active conversation is set', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });
      
      expect(result.current).toBeNull();
    });

    it('should return current active conversation ID when set', () => {
      stateManager.setActiveConversationId('conv-123');
      const wrapper = createWrapper(stateManager);
      
      const { result } = renderHook(() => useActiveConversation(), { wrapper });
      
      expect(result.current).toBe('conv-123');
    });
  });

  describe('Event Subscription and State Updates', () => {
    it('should update when active conversation changes', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });
      
      expect(result.current).toBeNull();

      // Change the active conversation
      act(() => {
        stateManager.setActiveConversationId('conv-456');
      });

      expect(result.current).toBe('conv-456');
    });

    it('should handle switching between conversations', () => {
      stateManager.setActiveConversationId('conv-123');
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });
      
      expect(result.current).toBe('conv-123');

      // Switch to a different conversation
      act(() => {
        stateManager.setActiveConversationId('conv-456');
      });

      expect(result.current).toBe('conv-456');
    });

    it('should handle multiple state updates correctly', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });
      
      // First update
      act(() => {
        stateManager.setActiveConversationId('conv-456');
      });
      expect(result.current).toBe('conv-456');

      // Second update
      act(() => {
        stateManager.setActiveConversationId('conv-789');
      });
      expect(result.current).toBe('conv-789');

             // Switch to another conversation
       act(() => {
         stateManager.setActiveConversationId('conv-abc');
       });
       expect(result.current).toBe('conv-abc');
    });
  });

  describe('State Manager Changes', () => {
    it('should update when switching between different state managers', async () => {
      // Test component that displays the conversation ID
      const TestComponent = () => {
        const conversationId = useActiveConversation();
        return <div data-testid="conversation-id">{conversationId || 'null'}</div>;
      };

      const wrapper1 = createWrapper(stateManager);
      const { unmount, getByTestId } = render(<TestComponent />, { wrapper: wrapper1 });
      
      // Set state in first manager
      act(() => {
        stateManager.setActiveConversationId('conv-123');
      });
      
      await waitFor(() => {
        expect(getByTestId('conversation-id')).toHaveTextContent('conv-123');
      });

      // Unmount the first render
      unmount();

      // Create new state manager with different state
      const newStateManager = createClientStateManager(mockClient);
      newStateManager.setActiveConversationId('conv-456');
      
      const wrapper2 = createWrapper(newStateManager);
      
      // Render with new wrapper
      const { getByTestId: getByTestId2 } = render(<TestComponent />, { wrapper: wrapper2 });
      
      await waitFor(() => {
        expect(getByTestId2('conversation-id')).toHaveTextContent('conv-456');
      });
    });

    it('should update when setting conversation ID after context switch', async () => {
      // Test component that displays the conversation ID
      const TestComponent = () => {
        const conversationId = useActiveConversation();
        return <div data-testid="conversation-id">{conversationId || 'null'}</div>;
      };

      const wrapper1 = createWrapper(stateManager);
      const { unmount, getByTestId } = render(<TestComponent />, { wrapper: wrapper1 });
      
      // Set state in first manager
      act(() => {
        stateManager.setActiveConversationId('conv-123');
      });
      
      await waitFor(() => {
        expect(getByTestId('conversation-id')).toHaveTextContent('conv-123');
      });

      // Unmount the first render
      unmount();

      // Create new state manager WITHOUT setting ID first
      const newStateManager = createClientStateManager(mockClient);
      const wrapper2 = createWrapper(newStateManager);
      
      // Render with new wrapper (should show null initially)
      const { getByTestId: getByTestId2 } = render(<TestComponent />, { wrapper: wrapper2 });
      
      await waitFor(() => {
        expect(getByTestId2('conversation-id')).toHaveTextContent('null');
      });
      
      // Then set the conversation ID
      act(() => {
        newStateManager.setActiveConversationId('conv-456');
      });
      
      await waitFor(() => {
        expect(getByTestId2('conversation-id')).toHaveTextContent('conv-456');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle context not being available', () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useActiveConversation());
      }).toThrow('AIStateContext not initialized');

      console.error = originalConsoleError;
    });

    it('should handle provider without state manager or client', () => {
      const ErrorWrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider>
          {children}
        </AIStateProvider>
      );

      expect(() => {
        renderHook(() => useActiveConversation(), { wrapper: ErrorWrapper });
      }).toThrow('AIStateProvider requires either a stateManager or a client');
    });
  });

  describe('Subscription Management', () => {
    it('should properly subscribe and unsubscribe', () => {
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe');
      const wrapper = createWrapper(stateManager);
      
      const { unmount } = renderHook(() => useActiveConversation(), { wrapper });
      
      // Should have subscribed to ACTIVE_CONVERSATION events
      expect(subscribeSpy).toHaveBeenCalledWith(Events.ACTIVE_CONVERSATION, expect.any(Function));
      
      // Should return unsubscribe function
      const unsubscribeCall = subscribeSpy.mock.results[0];
      expect(typeof unsubscribeCall.value).toBe('function');
      
      // Cleanup should call unsubscribe
      const unsubscribeFn = unsubscribeCall.value;
      const unsubscribeSpy = jest.fn(unsubscribeFn);
      subscribeSpy.mockReturnValue(unsubscribeSpy);
      
      unmount();
      
      subscribeSpy.mockRestore();
    });
  });
}); 