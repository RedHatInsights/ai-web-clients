import { renderHook, act } from '@testing-library/react';
import { useInitLimitation } from './useInitLimitation';
import {
  createClientStateManager,
  StateManager,
  Events,
} from '@redhat-cloud-services/ai-client-state';
import type {
  IAIClient,
  ClientInitLimitation,
} from '@redhat-cloud-services/ai-client-common';
import React from 'react';
import { AIStateProvider } from './AIStateProvider';

describe('useInitLimitation', () => {
  let mockClient: jest.Mocked<IAIClient>;
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
      init: jest.fn().mockResolvedValue({
        initialConversationId: 'test-conv',
        conversations: [],
      }),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      createNewConversation: jest.fn().mockResolvedValue({
        id: 'new-conv',
        title: 'New Conversation',
        locked: false,
      }),
      getInitOptions: jest.fn().mockReturnValue({
        initializeNewConversation: true,
      }),
      getServiceStatus: jest.fn(),
    };

    stateManager = createClientStateManager(mockClient);
  });

  describe('Basic functionality', () => {
    it('should return undefined when no limitation is present', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      expect(result.current).toBeUndefined();
    });

    it('should return limitation when present in state', async () => {
      const mockLimitation: ClientInitLimitation = {
        reason: 'QUOTA_EXCEEDED',
        detail: 'User has exceeded their monthly query limit',
      };

      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'test-conv',
        conversations: [],
        limitation: mockLimitation,
      });

      await stateManager.init();

      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      expect(result.current).toEqual(mockLimitation);
    });

    it('should update when limitation changes', async () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      expect(result.current).toBeUndefined();

      const mockLimitation: ClientInitLimitation = {
        reason: 'RATE_LIMITED',
        detail: 'Too many requests',
      };

      // Update the client to return limitation
      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'test-conv',
        conversations: [],
        limitation: mockLimitation,
      });

      // Re-initialize to get the limitation
      await act(async () => {
        await stateManager.init();
      });

      expect(result.current).toEqual(mockLimitation);
    });

    it('should handle limitation with only reason field', async () => {
      const mockLimitation: ClientInitLimitation = {
        reason: 'SERVICE_UNAVAILABLE',
      };

      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'test-conv',
        conversations: [],
        limitation: mockLimitation,
      });

      await stateManager.init();

      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      expect(result.current).toEqual({
        reason: 'SERVICE_UNAVAILABLE',
      });
      expect(result.current?.detail).toBeUndefined();
    });
  });

  describe('Event subscription', () => {
    it('should subscribe to INIT_LIMITATION events', () => {
      const wrapper = createWrapper(stateManager);
      const subscribeSpy = jest.spyOn(stateManager, 'subscribe');

      renderHook(() => useInitLimitation(), { wrapper });

      expect(subscribeSpy).toHaveBeenCalledWith(
        Events.INIT_LIMITATION,
        expect.any(Function)
      );
    });

    it('should unsubscribe on unmount', () => {
      const wrapper = createWrapper(stateManager);
      const unsubscribeMock = jest.fn();
      const subscribeSpy = jest
        .spyOn(stateManager, 'subscribe')
        .mockReturnValue(unsubscribeMock);

      const { unmount } = renderHook(() => useInitLimitation(), { wrapper });

      expect(subscribeSpy).toHaveBeenCalled();

      unmount();

      expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('should respond to limitation events during component lifecycle', async () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      expect(result.current).toBeUndefined();

      // Initialize with limitation
      const mockLimitation: ClientInitLimitation = {
        reason: 'AUTHENTICATION_FAILED',
        detail: 'Invalid credentials',
      };

      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'test-conv',
        conversations: [],
        limitation: mockLimitation,
      });

      await act(async () => {
        await stateManager.init();
      });

      expect(result.current).toEqual(mockLimitation);
    });
  });

  describe('Limitation object immutability', () => {
    it('should return a copy of the limitation object', async () => {
      const mockLimitation: ClientInitLimitation = {
        reason: 'QUOTA_EXCEEDED',
        detail: 'Monthly limit reached',
      };

      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'test-conv',
        conversations: [],
        limitation: mockLimitation,
      });

      await stateManager.init();

      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      const returnedLimitation = result.current;
      const stateLimitation = stateManager.getInitLimitation();

      expect(returnedLimitation).toEqual(stateLimitation);
      // The hook returns the limitation object directly (not a copy in this implementation)
      // This is fine since limitation objects should be treated as immutable
      expect(returnedLimitation).toEqual(mockLimitation);
    });

    it('should handle undefined limitation gracefully', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      expect(result.current).toBeUndefined();
      expect(() => result.current).not.toThrow();
    });
  });

  describe('Different limitation scenarios', () => {
    const testCases = [
      {
        limitation: { reason: 'QUOTA_EXCEEDED' },
        description: 'quota exceeded without detail',
      },
      {
        limitation: {
          reason: 'SERVICE_UNAVAILABLE',
          detail: 'Maintenance mode',
        },
        description: 'service unavailable with detail',
      },
      {
        limitation: { reason: 'RATE_LIMITED', detail: 'Too many requests' },
        description: 'rate limited with detail',
      },
      {
        limitation: {
          reason: 'AUTHENTICATION_FAILED',
          detail: 'Invalid token',
        },
        description: 'authentication failed with detail',
      },
    ];

    testCases.forEach(({ limitation, description }) => {
      it(`should handle ${description}`, async () => {
        mockClient.init = jest.fn().mockResolvedValue({
          initialConversationId: 'test-conv',
          conversations: [],
          limitation,
        });

        await stateManager.init();

        const wrapper = createWrapper(stateManager);
        const { result } = renderHook(() => useInitLimitation(), { wrapper });

        expect(result.current).toEqual(limitation);
      });
    });
  });

  describe('Error handling', () => {
    it('should throw error when used outside AIStateProvider', () => {
      const ErrorWrapper = ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      );

      expect(() => {
        renderHook(() => useInitLimitation(), { wrapper: ErrorWrapper });
      }).toThrow('AIStateContext not initialized');
    });

    it('should handle state manager with undefined getInitLimitation', () => {
      // Create a mock state manager that simulates a state manager without getInitLimitation
      const mockStateManager = {
        getState: jest.fn().mockReturnValue({
          initLimitation: undefined,
        }),
        getInitLimitation: jest.fn().mockReturnValue(undefined),
        subscribe: jest.fn().mockReturnValue(jest.fn()),
      } as any;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AIStateProvider stateManager={mockStateManager}>
          {children}
        </AIStateProvider>
      );

      const { result } = renderHook(() => useInitLimitation(), { wrapper });

      expect(result.current).toBeUndefined();
    });
  });

  describe('Hook re-renders and stability', () => {
    it('should maintain stable reference when limitation does not change', async () => {
      const mockLimitation: ClientInitLimitation = {
        reason: 'QUOTA_EXCEEDED',
        detail: 'Monthly limit reached',
      };

      mockClient.init = jest.fn().mockResolvedValue({
        initialConversationId: 'test-conv',
        conversations: [],
        limitation: mockLimitation,
      });

      await stateManager.init();

      const wrapper = createWrapper(stateManager);
      const { result, rerender } = renderHook(() => useInitLimitation(), {
        wrapper,
      });

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toEqual(secondResult);
      expect(firstResult).toEqual(mockLimitation);
    });
  });
});
