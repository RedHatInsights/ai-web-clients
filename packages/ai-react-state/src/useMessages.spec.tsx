import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { useMessages } from './useMessages';
import { AIStateProvider } from './AIStateProvider';
import { createClientStateManager, Events } from '@redhat-cloud-services/ai-client-state';
import type { Message } from '@redhat-cloud-services/ai-client-state';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';

describe('useMessages', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let mockSendMessage: jest.SpyInstance<any, any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      sendMessage: jest.fn().mockResolvedValue({
        id: 'response-id',
        answer: 'Mock response',
        role: 'bot'
      }),
      healthCheck: jest.fn().mockResolvedValue({ status: 'ok' })
    };

    mockSendMessage = jest.spyOn(mockClient, 'sendMessage');
  });

  afterEach(() => {
    mockSendMessage.mockRestore();
  });

  describe('Initial State', () => {
    it('should return current messages on initial render', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      // Add some messages to the conversation
      const testMessages: Message[] = [
        { id: 'msg-1', answer: 'Hello', role: 'user' },
        { id: 'msg-2', answer: 'Hi there!', role: 'bot' },
        { id: 'msg-3', answer: 'How are you?', role: 'user' }
      ];

      // Mock the internal state to have messages
      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(testMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      
      expect(result.current).toEqual(testMessages);
      expect(getMessagesSpy).toHaveBeenCalled();

      getMessagesSpy.mockRestore();
    });

    it('should return empty array when no messages exist', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('empty-conversation');

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      
      expect(result.current).toEqual([]);

      getMessagesSpy.mockRestore();
    });

    it('should handle messages with unified answer field', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const messagesWithAnswer: Message[] = [
        { id: 'msg-1', answer: 'First message', role: 'user' },
        { id: 'msg-2', answer: 'Second message', role: 'bot' }
      ];
      
      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(messagesWithAnswer);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      
      expect(result.current).toEqual(messagesWithAnswer);
      expect(result.current[0].answer).toBe('First message');
      expect(result.current[1].answer).toBe('Second message');

      getMessagesSpy.mockRestore();
    });
  });

  describe('Event Subscription', () => {
    it('should subscribe to MESSAGE events on mount', () => {
      const stateManager = createClientStateManager(mockClient);
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      renderHook(() => useMessages(), { wrapper });
      
      expect(subscribeSpy).toHaveBeenCalledWith(Events.MESSAGE, expect.any(Function));

      subscribeSpy.mockRestore();
    });

    it('should subscribe to ACTIVE_CONVERSATION events on mount', () => {
      const stateManager = createClientStateManager(mockClient);
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      renderHook(() => useMessages(), { wrapper });
      
      expect(subscribeSpy).toHaveBeenCalledWith(Events.ACTIVE_CONVERSATION, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledTimes(2);

      subscribeSpy.mockRestore();
    });

    it('should unsubscribe from both events on unmount', () => {
      const stateManager = createClientStateManager(mockClient);
      const mockUnsubscribe = jest.fn();
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockReturnValue(mockUnsubscribe);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { unmount } = renderHook(() => useMessages(), { wrapper });
      
      unmount();
      
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);

      subscribeSpy.mockRestore();
    });

    it('should resubscribe when state manager changes', async () => {
      const stateManager1 = createClientStateManager(mockClient);
      const stateManager2 = createClientStateManager(mockClient);

      const subscribeSpy1 = jest.spyOn(stateManager1, 'subscribe');
      const subscribeSpy2 = jest.spyOn(stateManager2, 'subscribe');

      // Use React components for context switching test
      const TestComponent = () => {
        const messages = useMessages();
        return <div data-testid="messages-count">{messages.length}</div>;
      };

      // First render with stateManager1
      const { unmount } = render(
        <AIStateProvider stateManager={stateManager1}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(subscribeSpy1).toHaveBeenCalledTimes(2);

      // Unmount completely
      unmount();

      // Re-render with stateManager2 (fresh React tree)
      render(
        <AIStateProvider stateManager={stateManager2}>
          <TestComponent />
        </AIStateProvider>
      );

      await waitFor(() => {
        expect(subscribeSpy2).toHaveBeenCalledTimes(2);
      });

      subscribeSpy1.mockRestore();
      subscribeSpy2.mockRestore();
    });
  });

  describe('Message Updates', () => {
    it('should update when MESSAGE event is triggered', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const initialMessages: Message[] = [
        { id: 'msg-1', answer: 'Hello', role: 'user' }
      ];

      const updatedMessages: Message[] = [
        ...initialMessages,
        { id: 'msg-2', answer: 'New message', role: 'bot' }
      ];

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(initialMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      
      expect(result.current).toEqual(initialMessages);

      // Update the mock to return new messages
      getMessagesSpy.mockReturnValue(updatedMessages);

      // Trigger MESSAGE event
      act(() => {
        messageCallback?.();
      });

      expect(result.current).toEqual(updatedMessages);

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should update when ACTIVE_CONVERSATION event is triggered', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('conversation-1');

      const conversation1Messages: Message[] = [
        { id: 'msg-1', answer: 'Conversation 1 message', role: 'user' }
      ];

      const conversation2Messages: Message[] = [
        { id: 'msg-2', answer: 'Conversation 2 message', role: 'user' }
      ];

      let conversationCallback: (() => void) | null = null;
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.ACTIVE_CONVERSATION) {
            conversationCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(conversation1Messages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      
      expect(result.current).toEqual(conversation1Messages);

      // Simulate conversation change
      getMessagesSpy.mockReturnValue(conversation2Messages);

      // Trigger ACTIVE_CONVERSATION event
      act(() => {
        conversationCallback?.();
      });

      expect(result.current).toEqual(conversation2Messages);

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should handle multiple consecutive updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const initialMessages: Message[] = [
        { id: 'msg-1', answer: 'Initial', role: 'user' }
      ];

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(initialMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      // First update
      const messages1 = [...initialMessages, { id: 'msg-2', answer: 'Update 1', role: 'bot' as const }];
      getMessagesSpy.mockReturnValue(messages1);

      act(() => {
        messageCallback?.();
      });

      expect(result.current).toEqual(messages1);

      // Second update
      const messages2 = [...messages1, { id: 'msg-3', answer: 'Update 2', role: 'user' as const }];
      getMessagesSpy.mockReturnValue(messages2);

      act(() => {
        messageCallback?.();
      });

      expect(result.current).toEqual(messages2);

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should handle empty message list updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([{ id: 'msg-1', answer: 'Initial', role: 'user' }]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      
      // Update to empty array
      getMessagesSpy.mockReturnValue([]);

      act(() => {
        messageCallback?.();
      });

      expect(result.current).toEqual([]);

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });
  });

  describe('Array Immutability', () => {
    it('should return new array instance on updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const initialMessages: Message[] = [
        { id: 'msg-1', answer: 'Initial', role: 'user' }
      ];

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(initialMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      const firstMessages = result.current;
      
      const newMessages = [...initialMessages, { id: 'msg-2', answer: 'New', role: 'bot' as const }];
      getMessagesSpy.mockReturnValue(newMessages);

      act(() => {
        messageCallback?.();
      });

      expect(result.current).not.toBe(firstMessages);
      expect(result.current).toEqual(newMessages);

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should spread messages correctly', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const testMessages: Message[] = [
        { id: 'msg-1', answer: 'Test message', role: 'user' }
      ];

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(testMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      
      const spreadMessages = [...result.current];
      expect(spreadMessages).toEqual(testMessages);
      expect(spreadMessages).not.toBe(result.current);

      getMessagesSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle context not being available', () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useMessages());
      }).toThrow('AIStateContext not initialized');

      console.error = originalConsoleError;
    });

    it('should handle getActiveConversationMessages errors gracefully', () => {
      const stateManager = createClientStateManager(mockClient);
      
      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockImplementation(() => {
          throw new Error('Messages error');
        });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      expect(() => {
        renderHook(() => useMessages(), { wrapper });
      }).toThrow('Messages error');

      getMessagesSpy.mockRestore();
    });

    it('should handle subscription errors gracefully', () => {
      const stateManager = createClientStateManager(mockClient);
      
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockImplementation(() => {
          throw new Error('Subscription error');
        });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      expect(() => {
        renderHook(() => useMessages(), { wrapper });
      }).toThrow('Subscription error');

      subscribeSpy.mockRestore();
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks with frequent updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest.spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      // Simulate many updates
      for (let i = 0; i < 100; i++) {
        const newMessages: Message[] = [
          { id: `msg-${i}`, answer: `Message ${i}`, role: 'user' }
        ];
        getMessagesSpy.mockReturnValue(newMessages);

        act(() => {
          messageCallback?.();
        });
      }

      expect(result.current).toHaveLength(1);
      expect(result.current[0].answer).toBe('Message 99');

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should properly cleanup subscriptions on rapid remounts', () => {
      const stateManager = createClientStateManager(mockClient);
      const mockUnsubscribe = jest.fn();
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe')
        .mockReturnValue(mockUnsubscribe);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { unmount } = renderHook(() => useMessages(), { wrapper });
      
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);

      // Mount again
      const { unmount: unmount2 } = renderHook(() => useMessages(), { wrapper });
      
      unmount2();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(4);

      subscribeSpy.mockRestore();
    });
  });
}); 