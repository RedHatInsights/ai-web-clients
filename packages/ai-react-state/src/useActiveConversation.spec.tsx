import { renderHook, render, act, waitFor } from '@testing-library/react';
import { useActiveConversation } from './useActiveConversation';
import {
  createClientStateManager,
  Events,
  StateManager,
} from '@redhat-cloud-services/ai-client-state';
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
        onError: jest.fn(),
      }),
      init: jest.fn(),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      createNewConversation: jest.fn().mockResolvedValue({
        id: 'new-conv',
        title: 'New Conversation',
        locked: false,
      }),
    };

    stateManager = createClientStateManager(mockClient);
  });

  describe('Initial State', () => {
    it('should return undefined when no active conversation is set', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });

      expect(result.current).toBeUndefined();
    });

    it('should return current active conversation object when set', async () => {
      // Create a conversation first so it exists in state
      const state = stateManager.getState();
      state.conversations['conv-123'] = {
        id: 'conv-123',
        title: 'Test Conversation',
        messages: [],
        locked: false,
      };

      await stateManager.setActiveConversationId('conv-123');
      const wrapper = createWrapper(stateManager);

      const { result } = renderHook(() => useActiveConversation(), { wrapper });

      expect(result.current).toEqual({
        id: 'conv-123',
        title: 'Test Conversation',
        messages: [],
        locked: false,
      });
    });
  });

  describe('Event Subscription and State Updates', () => {
    it('should update when active conversation changes', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });

      expect(result.current).toBeUndefined();

      // Create a conversation first so it exists in state
      const state = stateManager.getState();
      state.conversations['conv-456'] = {
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      };

      // Change the active conversation
      act(() => {
        stateManager.setActiveConversationId('conv-456');
      });

      expect(result.current).toEqual({
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      });
    });

    it('should handle switching between conversations', () => {
      // Create conversations first so they exist in state
      const state = stateManager.getState();
      state.conversations['conv-123'] = {
        id: 'conv-123',
        title: 'Test Conversation 123',
        messages: [],
        locked: false,
      };
      state.conversations['conv-456'] = {
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      };

      stateManager.setActiveConversationId('conv-123');
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });

      expect(result.current).toEqual({
        id: 'conv-123',
        title: 'Test Conversation 123',
        messages: [],
        locked: false,
      });

      // Switch to a different conversation
      act(() => {
        stateManager.setActiveConversationId('conv-456');
      });

      expect(result.current).toEqual({
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      });
    });

    it('should handle multiple state updates correctly', () => {
      // Create conversations first so they exist in state
      const state = stateManager.getState();
      state.conversations['conv-456'] = {
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      };
      state.conversations['conv-789'] = {
        id: 'conv-789',
        title: 'Test Conversation 789',
        messages: [],
        locked: false,
      };
      state.conversations['conv-abc'] = {
        id: 'conv-abc',
        title: 'Test Conversation ABC',
        messages: [],
        locked: false,
      };

      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useActiveConversation(), { wrapper });

      // First update
      act(() => {
        stateManager.setActiveConversationId('conv-456');
      });
      expect(result.current).toEqual({
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      });

      // Second update
      act(() => {
        stateManager.setActiveConversationId('conv-789');
      });
      expect(result.current).toEqual({
        id: 'conv-789',
        title: 'Test Conversation 789',
        messages: [],
        locked: false,
      });

      // Switch to another conversation
      act(() => {
        stateManager.setActiveConversationId('conv-abc');
      });
      expect(result.current).toEqual({
        id: 'conv-abc',
        title: 'Test Conversation ABC',
        messages: [],
        locked: false,
      });
    });
  });

  describe('State Manager Changes', () => {
    it('should update when switching between different state managers', async () => {
      // Test component that displays the conversation ID
      const TestComponent = () => {
        const conversation = useActiveConversation();
        return (
          <div data-testid="conversation-id">{conversation?.id || 'null'}</div>
        );
      };

      // Create conversation in first state manager
      const state1 = stateManager.getState();
      state1.conversations['conv-123'] = {
        id: 'conv-123',
        title: 'Test Conversation 123',
        messages: [],
        locked: false,
      };

      const wrapper1 = createWrapper(stateManager);
      const { unmount, getByTestId } = render(<TestComponent />, {
        wrapper: wrapper1,
      });

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
      const state2 = newStateManager.getState();
      state2.conversations['conv-456'] = {
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      };
      newStateManager.setActiveConversationId('conv-456');

      const wrapper2 = createWrapper(newStateManager);

      // Render with new wrapper
      const { getByTestId: getByTestId2 } = render(<TestComponent />, {
        wrapper: wrapper2,
      });

      await waitFor(() => {
        expect(getByTestId2('conversation-id')).toHaveTextContent('conv-456');
      });
    });

    it('should update when setting conversation ID after context switch', async () => {
      // Test component that displays the conversation ID
      const TestComponent = () => {
        const conversation = useActiveConversation();
        return (
          <div data-testid="conversation-id">{conversation?.id || 'null'}</div>
        );
      };

      // Create conversation in first state manager
      const state1 = stateManager.getState();
      state1.conversations['conv-123'] = {
        id: 'conv-123',
        title: 'Test Conversation 123',
        messages: [],
        locked: false,
      };

      const wrapper1 = createWrapper(stateManager);
      const { unmount, getByTestId } = render(<TestComponent />, {
        wrapper: wrapper1,
      });

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
      const { getByTestId: getByTestId2 } = render(<TestComponent />, {
        wrapper: wrapper2,
      });

      await waitFor(() => {
        expect(getByTestId2('conversation-id')).toHaveTextContent('null');
      });

      // Create conversation in new state manager and then set the conversation ID
      const state2 = newStateManager.getState();
      state2.conversations['conv-456'] = {
        id: 'conv-456',
        title: 'Test Conversation 456',
        messages: [],
        locked: false,
      };

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
        <AIStateProvider>{children}</AIStateProvider>
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

      const { unmount } = renderHook(() => useActiveConversation(), {
        wrapper,
      });

      // Should have subscribed to ACTIVE_CONVERSATION events
      expect(subscribeSpy).toHaveBeenCalledWith(
        Events.ACTIVE_CONVERSATION,
        expect.any(Function)
      );

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
