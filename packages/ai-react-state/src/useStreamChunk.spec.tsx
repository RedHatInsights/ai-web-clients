import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { useStreamChunk } from './useStreamChunk';
import { AIStateProvider } from './AIStateProvider';
import {
  createClientStateManager,
  Events,
} from '@redhat-cloud-services/ai-client-state';
import type {
  IAIClient,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';

describe('useStreamChunk', () => {
  let mockClient: jest.Mocked<IAIClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      init: jest.fn().mockResolvedValue({
        conversations: [],
      }),
      sendMessage: jest.fn().mockResolvedValue({
        messageId: 'test-msg',
        answer: 'Test response',
        conversationId: 'test-conv',
      }),
      healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      createNewConversation: jest.fn().mockResolvedValue({
        id: 'new-conv',
        title: 'New Conversation',
        locked: false,
      }),
      getServiceStatus: jest.fn(),
    } as jest.Mocked<IAIClient>;
  });

  describe('Initial State', () => {
    it('should return undefined on initial render when no stream chunk exists', () => {
      const stateManager = createClientStateManager(mockClient);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk(), { wrapper });

      expect(result.current).toBeUndefined();
    });

    it('should return current stream chunk on initial render when chunk exists', async () => {
      const stateManager = createClientStateManager(mockClient);
      await stateManager.setActiveConversationId('test-conv');

      const mockStreamChunk: IStreamChunk = {
        answer: 'Initial stream chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: { priority: 'high' },
      };

      // Mock the getActiveConversationStreamChunk method to return a chunk
      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(mockStreamChunk);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk(), { wrapper });

      expect(result.current).toEqual(mockStreamChunk);
      expect(getStreamChunkSpy).toHaveBeenCalled();

      getStreamChunkSpy.mockRestore();
    });
  });

  describe('Event Subscription', () => {
    it('should subscribe to STREAM_CHUNK events on mount', () => {
      const stateManager = createClientStateManager(mockClient);
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      renderHook(() => useStreamChunk(), { wrapper });

      expect(subscribeSpy).toHaveBeenCalledWith(
        Events.STREAM_CHUNK,
        expect.any(Function)
      );

      subscribeSpy.mockRestore();
    });

    it('should unsubscribe from STREAM_CHUNK events on unmount', () => {
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

      const { unmount } = renderHook(() => useStreamChunk(), { wrapper });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();

      subscribeSpy.mockRestore();
    });

    it('should resubscribe when state manager changes', async () => {
      const stateManager1 = createClientStateManager(mockClient);
      const stateManager2 = createClientStateManager(mockClient);

      const subscribeSpy1 = jest.spyOn(stateManager1, 'subscribe');
      const subscribeSpy2 = jest.spyOn(stateManager2, 'subscribe');

      // Use React components for context switching test
      const TestComponent = () => {
        const streamChunk = useStreamChunk();
        return (
          <div data-testid="stream-chunk">
            {streamChunk?.answer || 'No chunk'}
          </div>
        );
      };

      // First render with stateManager1
      const { unmount } = render(
        <AIStateProvider stateManager={stateManager1}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(subscribeSpy1).toHaveBeenCalledWith(
        Events.STREAM_CHUNK,
        expect.any(Function)
      );

      // Unmount completely
      unmount();

      // Re-render with stateManager2 (fresh React tree)
      render(
        <AIStateProvider stateManager={stateManager2}>
          <TestComponent />
        </AIStateProvider>
      );

      await waitFor(() => {
        expect(subscribeSpy2).toHaveBeenCalledWith(
          Events.STREAM_CHUNK,
          expect.any(Function)
        );
      });

      subscribeSpy1.mockRestore();
      subscribeSpy2.mockRestore();
    });
  });

  describe('Stream Chunk Updates', () => {
    it('should update when STREAM_CHUNK event is triggered', async () => {
      const stateManager = createClientStateManager(mockClient);
      await stateManager.setActiveConversationId('test-conv');

      const initialChunk: IStreamChunk = {
        answer: 'Initial chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: {},
      };

      const updatedChunk: IStreamChunk = {
        answer: 'Updated chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: { updated: true },
      };

      let streamChunkCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.STREAM_CHUNK) {
            streamChunkCallback = callback;
          }
          return jest.fn();
        });

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(initialChunk);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk(), { wrapper });

      expect(result.current).toEqual(initialChunk);

      // Update the mock to return new chunk
      getStreamChunkSpy.mockReturnValue(updatedChunk);

      // Trigger STREAM_CHUNK event
      act(() => {
        streamChunkCallback?.();
      });

      expect(result.current).toEqual(updatedChunk);

      subscribeSpy.mockRestore();
      getStreamChunkSpy.mockRestore();
    });

    it('should handle transition from undefined to chunk', async () => {
      const stateManager = createClientStateManager(mockClient);
      await stateManager.setActiveConversationId('test-conv');

      const streamChunk: IStreamChunk = {
        answer: 'First chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: {},
      };

      let streamChunkCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.STREAM_CHUNK) {
            streamChunkCallback = callback;
          }
          return jest.fn();
        });

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(undefined);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk(), { wrapper });

      expect(result.current).toBeUndefined();

      // Update the mock to return a chunk
      getStreamChunkSpy.mockReturnValue(streamChunk);

      // Trigger STREAM_CHUNK event
      act(() => {
        streamChunkCallback?.();
      });

      expect(result.current).toEqual(streamChunk);

      subscribeSpy.mockRestore();
      getStreamChunkSpy.mockRestore();
    });

    it('should handle transition from chunk to undefined', async () => {
      const stateManager = createClientStateManager(mockClient);
      await stateManager.setActiveConversationId('test-conv');

      const streamChunk: IStreamChunk = {
        answer: 'Existing chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: {},
      };

      let streamChunkCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.STREAM_CHUNK) {
            streamChunkCallback = callback;
          }
          return jest.fn();
        });

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(streamChunk);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk(), { wrapper });

      expect(result.current).toEqual(streamChunk);

      // Update the mock to return undefined (e.g., conversation switched)
      getStreamChunkSpy.mockReturnValue(undefined);

      // Trigger STREAM_CHUNK event
      act(() => {
        streamChunkCallback?.();
      });

      expect(result.current).toBeUndefined();

      subscribeSpy.mockRestore();
      getStreamChunkSpy.mockRestore();
    });

    it('should handle multiple consecutive stream chunk updates', async () => {
      const stateManager = createClientStateManager(mockClient);
      await stateManager.setActiveConversationId('test-conv');

      let streamChunkCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.STREAM_CHUNK) {
            streamChunkCallback = callback;
          }
          return jest.fn();
        });

      const chunk1: IStreamChunk = {
        answer: 'First',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: { sequence: 1 },
      };

      const chunk2: IStreamChunk = {
        answer: 'First Second',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: { sequence: 2 },
      };

      const chunk3: IStreamChunk = {
        answer: 'First Second Third',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: { sequence: 3 },
      };

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(chunk1);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk(), { wrapper });

      expect(result.current).toEqual(chunk1);

      // Update to chunk2
      getStreamChunkSpy.mockReturnValue(chunk2);
      act(() => {
        streamChunkCallback?.();
      });

      expect(result.current).toEqual(chunk2);

      // Update to chunk3
      getStreamChunkSpy.mockReturnValue(chunk3);
      act(() => {
        streamChunkCallback?.();
      });

      expect(result.current).toEqual(chunk3);

      subscribeSpy.mockRestore();
      getStreamChunkSpy.mockRestore();
    });
  });

  describe('TypeScript Generic Support', () => {
    it('should support typed additional attributes', async () => {
      interface CustomAttributes {
        confidence: number;
        source: string;
      }

      const stateManager = createClientStateManager(mockClient);
      await stateManager.setActiveConversationId('test-conv');

      const typedChunk: IStreamChunk<CustomAttributes> = {
        answer: 'Typed chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: {
          confidence: 0.95,
          source: 'test-source',
        },
      };

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(typedChunk);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk<CustomAttributes>(), {
        wrapper,
      });

      expect(result.current).toEqual(typedChunk);
      expect(result.current?.additionalAttributes.confidence).toBe(0.95);
      expect(result.current?.additionalAttributes.source).toBe('test-source');

      getStreamChunkSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle context not being available', () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useStreamChunk());
      }).toThrow('AIStateContext not initialized');

      console.error = originalConsoleError;
    });

    it('should handle getActiveConversationStreamChunk errors gracefully', () => {
      const stateManager = createClientStateManager(mockClient);

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockImplementation(() => {
          throw new Error('Stream chunk error');
        });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      expect(() => {
        renderHook(() => useStreamChunk(), { wrapper });
      }).toThrow('Stream chunk error');

      getStreamChunkSpy.mockRestore();
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
        renderHook(() => useStreamChunk(), { wrapper });
      }).toThrow('Subscription error');

      subscribeSpy.mockRestore();
    });
  });

  describe('Integration with Real Streaming', () => {
    it('should update with real streaming simulation', async () => {
      const stateManager = createClientStateManager(mockClient);
      await stateManager.setActiveConversationId('streaming-conv');

      // Set up the client to simulate streaming behavior
      mockClient.sendMessage = jest
        .fn()
        .mockImplementation(async (convId, message, options) => {
          const streamChunk: IStreamChunk = {
            answer: 'Streaming response chunk',
            messageId: 'stream-msg-1',
            conversationId: convId,
            additionalAttributes: { isStreaming: true },
          };

          // Simulate the streaming by calling handleChunk if provided
          if (options?.handleChunk) {
            options.handleChunk(streamChunk);
          }

          return {
            messageId: 'final-msg',
            answer: 'Final response',
            conversationId: convId,
          };
        });

      let capturedChunk: IStreamChunk | undefined;
      const TestComponent = () => {
        const streamChunk = useStreamChunk();
        capturedChunk = streamChunk;
        return (
          <div data-testid="stream-chunk">
            {streamChunk?.answer || 'No chunk'}
          </div>
        );
      };

      const { getByTestId } = render(
        <AIStateProvider stateManager={stateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      // Initially no chunk
      expect(getByTestId('stream-chunk').textContent).toBe('No chunk');

      // Send a streaming message
      await act(async () => {
        await stateManager.sendMessage('Test message', { stream: true });
      });

      // Wait for the component to update
      await waitFor(() => {
        expect(getByTestId('stream-chunk').textContent).toBe(
          'Streaming response chunk'
        );
      });

      expect(capturedChunk).toEqual({
        answer: 'Streaming response chunk',
        messageId: 'stream-msg-1',
        conversationId: 'streaming-conv',
        additionalAttributes: { isStreaming: true },
      });
    });
  });

  describe('Object Identity', () => {
    it('should return same object reference for unchanged chunks', () => {
      const stateManager = createClientStateManager(mockClient);

      const streamChunk: IStreamChunk = {
        answer: 'Same chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: {},
      };

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(streamChunk);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result, rerender } = renderHook(() => useStreamChunk(), {
        wrapper,
      });

      const firstResult = result.current;

      // Force re-render without changing the chunk
      rerender();

      const secondResult = result.current;

      // Should be the same object reference since useReducer only changes when identity changes
      expect(firstResult).toBe(secondResult);

      getStreamChunkSpy.mockRestore();
    });

    it('should return new object reference when chunk identity changes', async () => {
      const stateManager = createClientStateManager(mockClient);

      const chunk1: IStreamChunk = {
        answer: 'First chunk',
        messageId: 'msg-1',
        conversationId: 'test-conv',
        additionalAttributes: {},
      };

      const chunk2: IStreamChunk = {
        answer: 'Second chunk',
        messageId: 'msg-2',
        conversationId: 'test-conv',
        additionalAttributes: {},
      };

      let streamChunkCallback: (() => void) | null = null;
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockImplementation((event, callback) => {
          if (event === Events.STREAM_CHUNK) {
            streamChunkCallback = callback;
          }
          return jest.fn();
        });

      const getStreamChunkSpy = jest
        .spyOn(stateManager, 'getActiveConversationStreamChunk')
        .mockReturnValue(chunk1);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={stateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useStreamChunk(), { wrapper });

      const firstResult = result.current;
      expect(firstResult).toBe(chunk1);

      // Change to different chunk object
      getStreamChunkSpy.mockReturnValue(chunk2);

      act(() => {
        streamChunkCallback?.();
      });

      const secondResult = result.current;
      expect(secondResult).toBe(chunk2);
      expect(firstResult).not.toBe(secondResult);

      subscribeSpy.mockRestore();
      getStreamChunkSpy.mockRestore();
    });
  });
});
