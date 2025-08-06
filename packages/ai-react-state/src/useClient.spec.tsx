import { renderHook } from '@testing-library/react';
import { useClient } from './useClient';
import {
  createClientStateManager,
  StateManager,
} from '@redhat-cloud-services/ai-client-state';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';
import React from 'react';
import { AIStateProvider } from './AIStateProvider';

// Mock client with additional method to test type inference
interface MockClientWithCustomMethod extends IAIClient {
  customMethod: () => string;
}

describe('useClient', () => {
  let mockClient: MockClientWithCustomMethod;
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
      customMethod: jest.fn().mockReturnValue('custom result'),
    };

    stateManager = createClientStateManager(mockClient);
  });

  describe('Basic functionality', () => {
    it('should return the client from state manager', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useClient(), { wrapper });

      expect(result.current).toBe(mockClient);
    });

    it('should return the same client instance on multiple calls', () => {
      const wrapper = createWrapper(stateManager);
      const { result, rerender } = renderHook(() => useClient(), { wrapper });

      const firstClient = result.current;
      rerender();
      const secondClient = result.current;

      expect(firstClient).toBe(secondClient);
      expect(firstClient).toBe(mockClient);
    });
  });

  describe('Generic type support', () => {
    it('should support generic typing for client-specific methods', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(
        () => useClient<MockClientWithCustomMethod>(),
        { wrapper }
      );

      // TypeScript should infer the correct type and allow access to customMethod
      expect(result.current.customMethod).toBeDefined();
      expect(result.current.customMethod()).toBe('custom result');
    });

    it('should work without generic parameter (fallback to IAIClient)', () => {
      const wrapper = createWrapper(stateManager);
      const { result } = renderHook(() => useClient(), { wrapper });

      // Should still have basic IAIClient methods
      expect(result.current.sendMessage).toBeDefined();
      expect(result.current.healthCheck).toBeDefined();
      expect(result.current.init).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should throw error when used outside AIStateProvider', () => {
      // Create a wrapper that doesn't provide AIStateContext
      const ErrorWrapper = ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      );

      expect(() => {
        renderHook(() => useClient(), { wrapper: ErrorWrapper });
      }).toThrow('AIStateContext not initialized');
    });
  });
});
