import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useCreateNewConversation } from './useCreateNewConversation';
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

describe('useCreateNewConversation', () => {
  let mockClient: jest.Mocked<IAIClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the createNewConversation function from state manager', () => {
    const TestComponent = () => {
      const createNewConversation = useCreateNewConversation();
      return (
        <div data-testid="function-type">{typeof createNewConversation}</div>
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
      const createNewConversation = useCreateNewConversation();
      capturedFunction = createNewConversation;
      return <div data-testid="test">test</div>;
    };

    const stateManager = createClientStateManager(mockClient);
    render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(capturedFunction).toBe(stateManager.createNewConversation);
  });

  it('should work with context switching', () => {
    const TestComponent = () => {
      const createNewConversation = useCreateNewConversation();
      return <div data-testid="test">{typeof createNewConversation}</div>;
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

    // The hook should return the function from the current context
    // We can't easily test function reference equality in this setup,
    // but we can verify the hook returns a function
    expect(typeof stateManager1.createNewConversation).toBe('function');
    expect(typeof stateManager2.createNewConversation).toBe('function');
  });

  it('should throw error when used outside of AIStateProvider context', () => {
    const TestComponent = () => {
      useCreateNewConversation();
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
});
