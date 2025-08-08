import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSetActiveConversation } from './useSetActiveConversation';
import { AIStateProvider } from './AIStateProvider';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { IAIClient } from '@redhat-cloud-services/ai-client-common';

// Mock client for testing
const createMockClient = (): jest.Mocked<IAIClient> => ({
  init: jest.fn().mockResolvedValue({
    initialConversationId: 'test-conversation-1',
    conversations: [
      { id: 'test-conversation-1', title: 'Test Conversation 1' },
    ],
  }),
  sendMessage: jest.fn(),
  getDefaultStreamingHandler: jest.fn(),
  getConversationHistory: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn(),
  getServiceStatus: jest.fn(),
  createNewConversation: jest.fn().mockResolvedValue({
    id: 'new-conversation-id',
    title: 'New Conversation',
  }),
  getInitOptions: jest.fn().mockReturnValue({
    initializeNewConversation: true,
  }),
});

describe('useSetActiveConversation', () => {
  let mockClient: jest.Mocked<IAIClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the setActiveConversationId function from state manager', () => {
    const TestComponent = () => {
      const setActiveConversation = useSetActiveConversation();
      return (
        <div data-testid="function-type">{typeof setActiveConversation}</div>
      );
    };

    const stateManager = createClientStateManager(mockClient);
    const { getByTestId } = render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(getByTestId('function-type').textContent).toBe('function');
  });

  it('should return the same function reference from state manager', () => {
    let capturedFunction: any;

    const TestComponent = () => {
      const setActiveConversation = useSetActiveConversation();
      capturedFunction = setActiveConversation;
      return <div data-testid="test">test</div>;
    };

    const stateManager = createClientStateManager(mockClient);
    render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(capturedFunction).toBe(stateManager.setActiveConversationId);
  });

  it('should work with context switching', () => {
    const TestComponent = () => {
      const setActiveConversation = useSetActiveConversation();
      return <div data-testid="test">{typeof setActiveConversation}</div>;
    };

    // First context
    const stateManager1 = createClientStateManager(mockClient);
    const { unmount } = render(
      <AIStateProvider stateManager={stateManager1}>
        <TestComponent />
      </AIStateProvider>
    );

    unmount();

    // Second context with different state manager
    const mockClient2 = createMockClient();
    const stateManager2 = createClientStateManager(mockClient2);

    render(
      <AIStateProvider stateManager={stateManager2}>
        <TestComponent />
      </AIStateProvider>
    );

    // Both state managers should have the function
    expect(typeof stateManager1.setActiveConversationId).toBe('function');
    expect(typeof stateManager2.setActiveConversationId).toBe('function');
  });

  it('should throw error when used outside of AIStateProvider context', () => {
    const TestComponent = () => {
      useSetActiveConversation();
      return <div>test</div>;
    };

    // Mock console.error to suppress the error output in tests
    const originalError = console.error;
    console.error = jest.fn();

    expect(() => {
      render(<TestComponent />);
    }).toThrow();

    console.error = originalError;
  });

  it('should return function that can be called', async () => {
    let capturedFunction: any;

    const TestComponent = () => {
      const setActiveConversation = useSetActiveConversation();
      capturedFunction = setActiveConversation;
      return <div data-testid="test">test</div>;
    };

    const stateManager = createClientStateManager(mockClient);
    await act(async () => {
      await stateManager.init();
    });

    // Set up spy BEFORE rendering so the hook captures the spy function
    const originalSetActive = stateManager.setActiveConversationId;
    const setActiveConversationIdSpy = jest
      .fn()
      .mockImplementation(originalSetActive);
    stateManager.setActiveConversationId = setActiveConversationIdSpy;

    render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    // The function should be callable
    expect(typeof capturedFunction).toBe('function');

    await act(async () => {
      await capturedFunction('test-conversation-id');
    });

    expect(setActiveConversationIdSpy).toHaveBeenCalledWith(
      'test-conversation-id'
    );
  });
});
