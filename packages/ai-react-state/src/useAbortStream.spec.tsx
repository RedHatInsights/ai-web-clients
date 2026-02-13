import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useAbortStream } from './useAbortStream';
import { AIStateProvider } from './AIStateProvider';
import {
  createClientStateManager,
  StateManager,
} from '@redhat-cloud-services/ai-client-state';
import { IAIClient } from '@redhat-cloud-services/ai-client-common';

describe('useAbortStream', () => {
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
      getConversationHistory: jest.fn().mockResolvedValue([]),
      init: jest.fn().mockResolvedValue('initial-conversation-id'),
      getDefaultStreamingHandler: jest.fn().mockReturnValue({
        onStart: jest.fn(),
        onChunk: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      }),
      getInitOptions: jest.fn().mockReturnValue({
        initializeNewConversation: true,
      }),
    };

    stateManager = createClientStateManager(mockClient);
  });

  it('should return abortStream function from state manager', () => {
    const wrapper = createWrapper(stateManager);
    const { result } = renderHook(() => useAbortStream(), { wrapper });

    expect(typeof result.current).toBe('function');
    expect(result.current).toBe(stateManager.abortStream);
  });

  it('should call state manager abortStream when invoked', () => {
    const wrapper = createWrapper(stateManager);
    const abortSpy = jest.spyOn(stateManager, 'abortStream');
    const { result } = renderHook(() => useAbortStream(), { wrapper });

    act(() => {
      result.current();
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    abortSpy.mockRestore();
  });

  it('should handle context not being available', () => {
    const originalConsoleError = console.error;
    console.error = jest.fn();

    expect(() => {
      renderHook(() => useAbortStream());
    }).toThrow('AIStateContext not initialized');

    console.error = originalConsoleError;
  });
});
