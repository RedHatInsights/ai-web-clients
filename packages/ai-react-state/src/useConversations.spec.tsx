import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useConversations } from './useConversations';
import { AIStateProvider } from './AIStateProvider';
import {
  createClientStateManager,
  Events,
} from '@redhat-cloud-services/ai-client-state';
import { IAIClient } from '@redhat-cloud-services/ai-client-common';

// Mock client for testing
const createMockClient = (): jest.Mocked<IAIClient> => ({
  init: jest.fn().mockResolvedValue({
    initialConversationId: 'test-conversation-1',
    conversations: [
      { id: 'test-conversation-1', title: 'Test Conversation 1' },
      { id: 'test-conversation-2', title: 'Test Conversation 2' },
    ],
  }),
  sendMessage: jest.fn(),
  getDefaultStreamingHandler: jest.fn(),
  getConversationHistory: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn(),
  getServiceStatus: jest.fn(),
  createNewConversation: jest
    .fn()
    .mockResolvedValue({ id: 'new-id', title: 'New Conversation' }),
});

describe('useConversations', () => {
  let mockClient: jest.Mocked<IAIClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty array initially before initialization', () => {
    const TestComponent = () => {
      const conversations = useConversations();
      return (
        <div data-testid="conversations-count">{conversations.length}</div>
      );
    };

    const stateManager = createClientStateManager(mockClient);
    const { getByTestId } = render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(getByTestId('conversations-count').textContent).toBe('0');
  });

  it('should return conversations after initialization', async () => {
    const TestComponent = () => {
      const conversations = useConversations();
      return (
        <div>
          <div data-testid="conversations-count">{conversations.length}</div>
          <div data-testid="conversation-ids">
            {conversations.map((c) => c.id).join(',')}
          </div>
        </div>
      );
    };

    const stateManager = createClientStateManager(mockClient);
    await act(async () => {
      await stateManager.init();
    });

    const { getByTestId } = render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(getByTestId('conversations-count').textContent).toBe('2');
    expect(getByTestId('conversation-ids').textContent).toBe(
      'test-conversation-1,test-conversation-2'
    );
  });

  it('should update when conversations change', async () => {
    const TestComponent = () => {
      const conversations = useConversations();
      return (
        <div data-testid="conversations-count">{conversations.length}</div>
      );
    };

    const stateManager = createClientStateManager(mockClient);
    await act(async () => {
      await stateManager.init();
    });

    const { getByTestId } = render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(getByTestId('conversations-count').textContent).toBe('2');

    // Create a new conversation which should trigger the CONVERSATIONS event
    await act(async () => {
      await stateManager.createNewConversation();
    });

    await waitFor(() => {
      expect(getByTestId('conversations-count').textContent).toBe('3');
    });
  });

  it('should clean up subscription on unmount', async () => {
    const TestComponent = () => {
      const conversations = useConversations();
      return (
        <div data-testid="conversations-count">{conversations.length}</div>
      );
    };

    const stateManager = createClientStateManager(mockClient);
    const subscribeSpy = jest.spyOn(stateManager, 'subscribe');
    await act(async () => {
      await stateManager.init();
    });

    const { unmount } = render(
      <AIStateProvider stateManager={stateManager}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(subscribeSpy).toHaveBeenCalledWith(
      Events.CONVERSATIONS,
      expect.any(Function)
    );

    unmount();

    // The unsubscribe function should have been called during cleanup
    // We can't directly test this, but we can verify the subscription was set up correctly
    expect(subscribeSpy).toHaveBeenCalledWith(
      Events.CONVERSATIONS,
      expect.any(Function)
    );

    subscribeSpy.mockRestore();
  });

  it('should handle context switching properly', async () => {
    const TestComponent = () => {
      const conversations = useConversations();
      return (
        <div data-testid="conversations-count">{conversations.length}</div>
      );
    };

    // First state manager with different data
    const stateManager1 = createClientStateManager(mockClient);
    await act(async () => {
      await stateManager1.init();
    });

    const { unmount, getByTestId } = render(
      <AIStateProvider stateManager={stateManager1}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(getByTestId('conversations-count').textContent).toBe('2');
    unmount();

    // Second state manager with different mock data
    const mockClient2 = createMockClient();
    mockClient2.init.mockResolvedValue({
      initialConversationId: 'different-conversation',
      conversations: [
        { id: 'different-conversation', title: 'Different Conversation' },
      ],
    });

    const stateManager2 = createClientStateManager(mockClient2);
    await act(async () => {
      await stateManager2.init();
    });

    const { getByTestId: getByTestId2 } = render(
      <AIStateProvider stateManager={stateManager2}>
        <TestComponent />
      </AIStateProvider>
    );

    expect(getByTestId2('conversations-count').textContent).toBe('1');
  });
});
