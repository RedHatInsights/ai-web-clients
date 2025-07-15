import { renderHook, render, act } from '@testing-library/react';
import { useSendMessage, useSendStreamMessage } from './useSendMessage';
import { createClientStateManager, StateManager, Message, MessageOptions } from '@redhat-cloud-services/ai-client-state';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';
import React from 'react';
import { AIStateProvider } from './AIStateProvider';

describe('useSendMessage', () => {
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
      })
    };
    
    stateManager = createClientStateManager(mockClient);
  });

  describe('Basic Functionality', () => {
    it('should return sendMessage function from state manager', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useSendMessage(), { wrapper });
      
      expect(typeof result.current).toBe('function');
      expect(result.current).toBe(stateManager.sendMessage);
    });

    it('should maintain function reference when component rerenders', () => {
      const wrapper = createWrapper(stateManager);
      const { result, rerender } = renderHook(() => useSendMessage(), { wrapper });
      const firstFunction = result.current;
      
      rerender();
      
      expect(result.current).toBe(firstFunction);
    });
  });

  describe('Context Integration', () => {
    it('should handle context not being available', () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useSendMessage());
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
        renderHook(() => useSendMessage(), { wrapper: ErrorWrapper });
      }).toThrow('AIStateProvider requires either a stateManager or a client');
    });
  });

  describe('Message Sending', () => {
    it('should call sendMessage with correct parameters', async () => {
      stateManager.setActiveConversationId('test-conversation-1');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage');
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'msg-1',
        answer: 'Test message content',
        role: 'user'
      };
      
      const options: MessageOptions = { 
        stream: false,
        customOption: 'value'
      };

      const { result } = renderHook(() => useSendMessage(), { wrapper });
      
      await act(async () => {
        await result.current(message, options);
      });
      
      expect(sendMessageSpy).toHaveBeenCalledWith(message, options);
      
      sendMessageSpy.mockRestore();
    });

    it('should handle sendMessage without options', async () => {
      stateManager.setActiveConversationId('test-conversation-2');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage');
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'msg-2',
        answer: 'Another test message',
        role: 'user'
      };

      const { result } = renderHook(() => useSendMessage(), { wrapper });
      
      await act(async () => {
        await result.current(message);
      });
      
      expect(sendMessageSpy).toHaveBeenCalledWith(message);
      
      sendMessageSpy.mockRestore();
    });

    it('should return the result from sendMessage', async () => {
      stateManager.setActiveConversationId('test-conversation-3');
      const mockResponse = { messageId: 'response-1', answer: 'Test response' };
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage').mockResolvedValue(mockResponse);
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'msg-3',
        answer: 'Message for response test',
        role: 'user'
      };

      const { result } = renderHook(() => useSendMessage(), { wrapper });
      
      let response;
      await act(async () => {
        response = await result.current(message);
      });
      
      expect(response).toBe(mockResponse);
      
      sendMessageSpy.mockRestore();
    });

    it('should handle sendMessage errors', async () => {
      stateManager.setActiveConversationId('test-conversation-4');
      const error = new Error('Send message failed');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage').mockRejectedValue(error);
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'msg-4',
        answer: 'Message that will fail',
        role: 'user'
      };

      const { result } = renderHook(() => useSendMessage(), { wrapper });
      
      await act(async () => {
        await expect(result.current(message)).rejects.toThrow('Send message failed');
      });
      
      sendMessageSpy.mockRestore();
    });
  });

  describe('State Manager Changes', () => {
    it('should update when switching between different state managers', () => {
      // Create test component to verify state manager switching
      const TestComponent = () => {
        const sendMessage = useSendMessage();
        return <div data-testid="send-function">{sendMessage.name}</div>;
      };

      const wrapper1 = createWrapper(stateManager);
      const { unmount } = render(<TestComponent />, { wrapper: wrapper1 });
      
      // Unmount first render
      unmount();

      // Create new state manager
      const newStateManager = createClientStateManager(mockClient);
      const wrapper2 = createWrapper(newStateManager);
      
      const { getByTestId } = render(<TestComponent />, { wrapper: wrapper2 });
      
      // Should render without errors (function exists)
      expect(getByTestId('send-function')).toBeInTheDocument();
    });
  });
});

describe('useSendStreamMessage', () => {
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
      })
    };
    
    stateManager = createClientStateManager(mockClient);
  });

  describe('Streaming Functionality', () => {
    it('should call sendMessage with stream: true by default', async () => {
      stateManager.setActiveConversationId('stream-conversation-1');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage');
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'stream-msg-1',
        answer: 'Stream this message',
        role: 'user'
      };

      const { result } = renderHook(() => useSendStreamMessage(), { wrapper });
      
      await act(async () => {
        await result.current(message);
      });
      
      expect(sendMessageSpy).toHaveBeenCalledWith(message, { stream: true });
      
      sendMessageSpy.mockRestore();
    });

    it('should preserve other options while setting stream: true', async () => {
      stateManager.setActiveConversationId('stream-conversation-2');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage');
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'stream-msg-2',
        answer: 'Stream with custom options',
        role: 'user'
      };
      
      const options: MessageOptions = { 
        customHeader: 'custom-value',
        timeout: 5000
      };

      const { result } = renderHook(() => useSendStreamMessage(), { wrapper });
      
      await act(async () => {
        await result.current(message, options);
      });
      
      expect(sendMessageSpy).toHaveBeenCalledWith(message, {
        customHeader: 'custom-value',
        timeout: 5000,
        stream: true
      });
      
      sendMessageSpy.mockRestore();
    });

    it('should override stream option when provided as false', async () => {
      stateManager.setActiveConversationId('stream-conversation-3');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage');
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'stream-msg-3',
        answer: 'Force stream despite option',
        role: 'user'
      };
      
      const options: MessageOptions = { stream: false };

      const { result } = renderHook(() => useSendStreamMessage(), { wrapper });
      
      await act(async () => {
        await result.current(message, options);
      });
      
      expect(sendMessageSpy).toHaveBeenCalledWith(message, { stream: true });
      
      sendMessageSpy.mockRestore();
    });

    it('should handle undefined options correctly', async () => {
      stateManager.setActiveConversationId('stream-conversation-4');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage');
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'stream-msg-4',
        answer: 'Stream without options',
        role: 'user'
      };

      const { result } = renderHook(() => useSendStreamMessage(), { wrapper });
      
      await act(async () => {
        await result.current(message, undefined);
      });
      
      expect(sendMessageSpy).toHaveBeenCalledWith(message, { stream: true });
      
      sendMessageSpy.mockRestore();
    });
  });

  describe('Memoization', () => {
    it('should return the same function reference when sendMessage does not change', () => {
      const wrapper = createWrapper(stateManager);
      const { result, rerender } = renderHook(() => useSendStreamMessage(), { wrapper });
      const firstFunction = result.current;
      
      rerender();
      
      expect(result.current).toBe(firstFunction);
    });
  });

  describe('Return Value', () => {
    it('should return the result from the wrapped sendMessage', async () => {
      stateManager.setActiveConversationId('stream-conversation-5');
      const mockResponse = { messageId: 'stream-response-1', answer: 'Streamed response' };
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage').mockResolvedValue(mockResponse);
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'stream-msg-5',
        answer: 'Message for stream response test',
        role: 'user'
      };

      const { result } = renderHook(() => useSendStreamMessage(), { wrapper });
      
      let response;
      await act(async () => {
        response = await result.current(message);
      });
      
      expect(response).toBe(mockResponse);
      
      sendMessageSpy.mockRestore();
    });

    it('should handle rejected promises correctly', async () => {
      stateManager.setActiveConversationId('stream-conversation-6');
      const error = new Error('Stream failed');
      const sendMessageSpy = jest.spyOn(stateManager, 'sendMessage').mockRejectedValue(error);
      const wrapper = createWrapper(stateManager);
      
      const message: Message = {
        id: 'stream-msg-6',
        answer: 'Message that will fail streaming',
        role: 'user'
      };

      const { result } = renderHook(() => useSendStreamMessage(), { wrapper });
      
      await act(async () => {
        await expect(result.current(message)).rejects.toThrow('Stream failed');
      });
      
      sendMessageSpy.mockRestore();
    });
  });

  describe('Context Integration', () => {
    it('should handle context not being available', () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useSendStreamMessage());
      }).toThrow('AIStateContext not initialized');

      console.error = originalConsoleError;
    });
  });
}); 