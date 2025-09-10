import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { useMessages } from './useMessages';
import { AIStateProvider } from './AIStateProvider';
import {
  createClientStateManager,
  Events,
} from '@redhat-cloud-services/ai-client-state';
import type { Message } from '@redhat-cloud-services/ai-client-state';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';

describe('useMessages', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let mockSendMessage: jest.SpyInstance<any, any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      init: jest.fn().mockResolvedValue('test-conversation-id'),
      sendMessage: jest.fn().mockResolvedValue({
        id: 'response-id',
        answer: 'Mock response',
        role: 'bot',
      }),
      healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
      getConversationHistory: jest.fn().mockResolvedValue([]),
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
        { id: 'msg-1', answer: 'Hello', role: 'user', date: new Date() },
        { id: 'msg-2', answer: 'Hi there!', role: 'bot', date: new Date() },
        { id: 'msg-3', answer: 'How are you?', role: 'user', date: new Date() },
      ];

      // Mock the internal state to have messages
      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(testMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      // Check content matches (hook adds empty additionalAttributes)
      expect(result.current).toHaveLength(3);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[0].answer).toBe('Hello');
      expect(result.current[1].id).toBe('msg-2');
      expect(result.current[1].answer).toBe('Hi there!');
      expect(result.current[2].id).toBe('msg-3');
      expect(result.current[2].answer).toBe('How are you?');
      expect(getMessagesSpy).toHaveBeenCalled();

      getMessagesSpy.mockRestore();
    });

    it('should return empty array when no messages exist', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('empty-conversation');

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
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
        {
          id: 'msg-1',
          answer: 'First message',
          role: 'user',
          date: new Date(),
        },
        {
          id: 'msg-2',
          answer: 'Second message',
          role: 'bot',
          date: new Date(),
        },
      ];

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(messagesWithAnswer);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      // Check content matches (hook adds empty additionalAttributes)
      expect(result.current).toHaveLength(2);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[0].answer).toBe('First message');
      expect(result.current[1].id).toBe('msg-2');
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

      expect(subscribeSpy).toHaveBeenCalledWith(
        Events.MESSAGE,
        expect.any(Function)
      );

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

      expect(subscribeSpy).toHaveBeenCalledWith(
        Events.ACTIVE_CONVERSATION,
        expect.any(Function)
      );
      expect(subscribeSpy).toHaveBeenCalledTimes(2);

      subscribeSpy.mockRestore();
    });

    it('should unsubscribe from both events on unmount', () => {
      const stateManager = createClientStateManager(mockClient);
      const mockUnsubscribe = jest.fn();
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
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
        { id: 'msg-1', answer: 'Hello', role: 'user', date: new Date() },
      ];

      const updatedMessages: Message[] = [
        ...initialMessages,
        { id: 'msg-2', answer: 'New message', role: 'bot', date: new Date() },
      ];

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(initialMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      // Check content matches (hook adds empty additionalAttributes)
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[0].answer).toBe('Hello');

      // Update the mock to return new messages
      getMessagesSpy.mockReturnValue(updatedMessages);

      // Trigger MESSAGE event
      act(() => {
        messageCallback?.();
      });

      // Check updated content
      expect(result.current).toHaveLength(2);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[1].id).toBe('msg-2');
      expect(result.current[1].answer).toBe('New message');

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should update when ACTIVE_CONVERSATION event is triggered', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('conversation-1');

      const conversation1Messages: Message[] = [
        {
          id: 'msg-1',
          answer: 'Conversation 1 message',
          role: 'user',
          date: new Date(),
        },
      ];

      const conversation2Messages: Message[] = [
        {
          id: 'msg-2',
          answer: 'Conversation 2 message',
          role: 'user',
          date: new Date(),
        },
      ];

      let conversationCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.ACTIVE_CONVERSATION) {
            conversationCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(conversation1Messages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      // Check content matches (hook adds empty additionalAttributes)
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[0].answer).toBe('Conversation 1 message');

      // Simulate conversation change
      getMessagesSpy.mockReturnValue(conversation2Messages);

      // Trigger ACTIVE_CONVERSATION event
      act(() => {
        conversationCallback?.();
      });

      // Check updated content
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe('msg-2');
      expect(result.current[0].answer).toBe('Conversation 2 message');

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should handle multiple consecutive updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const initialMessages: Message[] = [
        { id: 'msg-1', answer: 'Initial', role: 'user', date: new Date() },
      ];

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(initialMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      // First update
      const messages1 = [
        ...initialMessages,
        {
          id: 'msg-2',
          answer: 'Update 1',
          role: 'bot' as const,
          date: new Date(),
        },
      ];
      getMessagesSpy.mockReturnValue(messages1);

      act(() => {
        messageCallback?.();
      });

      // Check first update content
      expect(result.current).toHaveLength(2);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[0].answer).toBe('Initial');
      expect(result.current[1].id).toBe('msg-2');
      expect(result.current[1].answer).toBe('Update 1');

      // Second update
      const messages2 = [
        ...messages1,
        {
          id: 'msg-3',
          answer: 'Update 2',
          role: 'user' as const,
          date: new Date(),
        },
      ];
      getMessagesSpy.mockReturnValue(messages2);

      act(() => {
        messageCallback?.();
      });

      // Check second update content
      expect(result.current).toHaveLength(3);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[1].id).toBe('msg-2');
      expect(result.current[2].id).toBe('msg-3');
      expect(result.current[2].answer).toBe('Update 2');

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should handle empty message list updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
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
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const initialMessages: Message[] = [
        { id: 'msg-1', answer: 'Initial', role: 'user', date: new Date() },
      ];

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(initialMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });
      const firstMessages = result.current;

      const newMessages = [
        ...initialMessages,
        { id: 'msg-2', answer: 'New', role: 'bot' as const, date: new Date() },
      ];
      getMessagesSpy.mockReturnValue(newMessages);

      act(() => {
        messageCallback?.();
      });

      expect(result.current).not.toBe(firstMessages);
      // Check content matches (accounting for added empty additionalAttributes)
      expect(result.current).toHaveLength(2);
      expect(result.current[0].id).toBe('msg-1');
      expect(result.current[0].answer).toBe('Initial');
      expect(result.current[1].id).toBe('msg-2');
      expect(result.current[1].answer).toBe('New');

      subscribeSpy.mockRestore();
      getMessagesSpy.mockRestore();
    });

    it('should spread messages correctly', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const testMessages: Message[] = [
        { id: 'msg-1', answer: 'Test message', role: 'user', date: new Date() },
      ];

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(testMessages);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useMessages(), { wrapper });

      const spreadMessages = [...result.current];
      // Check content matches (accounting for added empty additionalAttributes)
      expect(spreadMessages).toHaveLength(1);
      expect(spreadMessages[0].id).toBe('msg-1');
      expect(spreadMessages[0].answer).toBe('Test message');
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

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
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

      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
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

  describe('Message Object Immutability', () => {
    it('should return new message objects on each render to trigger React re-renders', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const originalMessage: Message = {
        id: 'msg-1',
        answer: 'Original message',
        role: 'user',
        additionalAttributes: { source: 'test', score: 0.8 },
        date: new Date('2023-01-01'),
      };

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([originalMessage]);

      let capturedMessages: Message[] = [];
      const TestComponent = () => {
        const messages = useMessages();
        capturedMessages = messages;
        return <div data-testid="message-count">{messages.length}</div>;
      };

      render(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      // Verify that returned message is not the same object reference
      expect(capturedMessages[0]).not.toBe(originalMessage);
      // But has the same content (excluding the added empty additionalAttributes)
      expect(capturedMessages[0].id).toBe(originalMessage.id);
      expect(capturedMessages[0].answer).toBe(originalMessage.answer);
      expect(capturedMessages[0].role).toBe(originalMessage.role);

      getMessagesSpy.mockRestore();
    });

    it('should create shallow copies of message objects between re-renders', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      // Create a message that will be "mutated" by state manager (simulating streaming)
      const originalMessage: Message = {
        id: 'msg-1',
        answer: 'Partial response',
        role: 'bot',
        additionalAttributes: { isStreaming: true, tokens: 5 },
        date: new Date('2023-01-01'),
      };

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([originalMessage]);

      let capturedMessages1: Message[] = [];
      let capturedMessages2: Message[] = [];
      let renderCount = 0;

      const TestComponent = () => {
        const messages = useMessages();
        renderCount++;
        if (renderCount === 1) {
          capturedMessages1 = messages;
        } else if (renderCount === 2) {
          capturedMessages2 = messages;
        }
        return (
          <div data-testid="message-text">
            {messages[0]?.answer || 'No message'}
          </div>
        );
      };

      const { getByTestId, rerender } = render(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(getByTestId('message-text').textContent).toBe('Partial response');
      const firstRenderMessage = capturedMessages1[0];

      // Simulate state manager mutating the message object (streaming update)
      originalMessage.answer = 'Complete response from streaming';
      originalMessage.additionalAttributes!.isStreaming = false;
      originalMessage.additionalAttributes!.tokens = 15;

      // Force re-render
      rerender(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(getByTestId('message-text').textContent).toBe(
        'Complete response from streaming'
      );
      const secondRenderMessage = capturedMessages2[0];

      // Verify objects are different instances (not same reference)
      expect(firstRenderMessage).not.toBe(secondRenderMessage);
      expect(firstRenderMessage.additionalAttributes).not.toBe(
        secondRenderMessage.additionalAttributes
      );

      // Verify the content is updated correctly
      expect(secondRenderMessage.answer).toBe(
        'Complete response from streaming'
      );
      expect(secondRenderMessage.additionalAttributes?.isStreaming).toBe(false);
      expect(secondRenderMessage.additionalAttributes?.tokens).toBe(15);

      getMessagesSpy.mockRestore();
    });

    it('should shallow copy additionalAttributes to prevent React prop mutation issues', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const additionalAttributes = {
        confidence: 0.95,
        sources: ['doc1', 'doc2'],
        metadata: { timestamp: '2023-01-01', version: '1.0' },
      };

      const originalMessage: Message = {
        id: 'msg-1',
        answer: 'Test message',
        role: 'bot',
        additionalAttributes,
        date: new Date('2023-01-01'),
      };

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([originalMessage]);

      let capturedMessages: Message[] = [];
      const TestComponent = () => {
        const messages = useMessages();
        capturedMessages = messages;
        return <div data-testid="message">{messages[0]?.answer}</div>;
      };

      render(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      const returnedMessage = capturedMessages[0];

      // Verify additionalAttributes is a shallow copy
      expect(returnedMessage.additionalAttributes).not.toBe(
        additionalAttributes
      );
      expect(returnedMessage.additionalAttributes).toEqual(
        additionalAttributes
      );

      // Verify that nested objects are still the same reference (shallow copy)
      expect(returnedMessage.additionalAttributes?.metadata).toBe(
        additionalAttributes.metadata
      );
      expect(returnedMessage.additionalAttributes?.sources).toBe(
        additionalAttributes.sources
      );

      getMessagesSpy.mockRestore();
    });

    it('should handle messages without additionalAttributes', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const originalMessage: Message = {
        id: 'msg-1',
        answer: 'Simple message',
        role: 'user',
        date: new Date('2023-01-01'),
      };

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([originalMessage]);

      let capturedMessages: Message[] = [];
      const TestComponent = () => {
        const messages = useMessages();
        capturedMessages = messages;
        return <div data-testid="message">{messages[0]?.answer}</div>;
      };

      render(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      const returnedMessage = capturedMessages[0];

      // Verify message is copied but additionalAttributes is handled gracefully
      expect(returnedMessage).not.toBe(originalMessage);
      expect(returnedMessage.additionalAttributes).toEqual({});
      expect(returnedMessage.id).toBe('msg-1');
      expect(returnedMessage.answer).toBe('Simple message');

      getMessagesSpy.mockRestore();
    });

    it('should prevent React from missing prop changes during streaming updates with actual EVENT triggers', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      // Simulate a streaming message that gets updated multiple times
      const streamingMessage: Message = {
        id: 'streaming-msg',
        answer: 'Starting to',
        role: 'bot',
        additionalAttributes: { isComplete: false, chunkCount: 1 },
        date: new Date('2023-01-01'),
      };

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue([streamingMessage]);

      let renderCount = 0;
      const capturedRenders: Message[][] = [];

      const TestComponent = () => {
        const messages = useMessages();
        renderCount++;
        capturedRenders.push([...messages]);
        return (
          <div data-testid="streaming-message">
            {messages[0]?.answer || 'No message'} - Chunks:{' '}
            {messages[0]?.additionalAttributes?.chunkCount}
          </div>
        );
      };

      const { getByTestId } = render(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      // Capture initial render
      expect(getByTestId('streaming-message').textContent).toBe(
        'Starting to - Chunks: 1'
      );
      const render1 = capturedRenders[0][0];

      // Simulate streaming chunk 1 - state manager mutates the same object
      streamingMessage.answer = 'Starting to stream';
      streamingMessage.additionalAttributes!.chunkCount = 2;

      // Trigger MESSAGE event manually to simulate state manager notifying
      act(() => {
        // Get the notify function and trigger MESSAGE event
        const state = stateManager.getState() as any;
        if (state.notify) {
          state.notify(Events.MESSAGE);
        }
      });

      await waitFor(() => {
        expect(getByTestId('streaming-message').textContent).toBe(
          'Starting to stream - Chunks: 2'
        );
      });

      const render2 = capturedRenders[renderCount - 1][0];
      expect(render2).not.toBe(render1); // Different object reference
      expect(render2.answer).toBe('Starting to stream');
      expect(render2.additionalAttributes?.chunkCount).toBe(2);

      getMessagesSpy.mockRestore();
    });

    it('should ensure each component render gets new message instances', () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      const messages: Message[] = [
        {
          id: 'msg-1',
          answer: 'First message',
          role: 'user',
          additionalAttributes: { type: 'query' },
          date: new Date('2023-01-01'),
        },
        {
          id: 'msg-2',
          answer: 'Second message',
          role: 'bot',
          additionalAttributes: { type: 'response' },
          date: new Date('2023-01-02'),
        },
      ];

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
        .mockReturnValue(messages);

      let firstCall: Message[] = [];
      let secondCall: Message[] = [];
      let renderCount = 0;

      const TestComponent = () => {
        const messagesResult = useMessages();
        renderCount++;
        if (renderCount === 1) {
          firstCall = messagesResult;
        } else if (renderCount === 2) {
          secondCall = messagesResult;
        }
        return <div data-testid="messages-count">{messagesResult.length}</div>;
      };

      const { rerender } = render(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      // Force a re-render by re-rendering the component
      rerender(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      // Arrays should be different instances
      expect(firstCall).not.toBe(secondCall);

      // Each message object should be a different instance
      expect(firstCall[0]).not.toBe(secondCall[0]);
      expect(firstCall[1]).not.toBe(secondCall[1]);

      // But content should be identical (both have empty additionalAttributes added)
      expect(firstCall[0].id).toBe(secondCall[0].id);
      expect(firstCall[0].answer).toBe(secondCall[0].answer);
      expect(firstCall[1].id).toBe(secondCall[1].id);
      expect(firstCall[1].answer).toBe(secondCall[1].answer);

      // Verify additionalAttributes are also copied
      expect(firstCall[0].additionalAttributes).not.toBe(
        secondCall[0].additionalAttributes
      );
      expect(firstCall[1].additionalAttributes).not.toBe(
        secondCall[1].additionalAttributes
      );

      getMessagesSpy.mockRestore();
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks with frequent updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      stateManager.setActiveConversationId('test-conversation');

      let messageCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.MESSAGE) {
            messageCallback = callback;
          }
          return jest.fn();
        });

      const getMessagesSpy = jest
        .spyOn(stateManager, 'getActiveConversationMessages')
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
          { id: `msg-${i}`, answer: `Message ${i}`, role: 'user' },
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
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
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
      const { unmount: unmount2 } = renderHook(() => useMessages(), {
        wrapper,
      });

      unmount2();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(4);

      subscribeSpy.mockRestore();
    });
  });
});
