import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AIStateProvider } from './AIStateProvider';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import type { IAIClient } from '@redhat-cloud-services/ai-client-common';
import type { StateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateContext } from './AiStateContext';

// Mock the state manager
jest.mock('@redhat-cloud-services/ai-client-state', () => ({
  createClientStateManager: jest.fn()
}));

const mockCreateClientStateManager = createClientStateManager as jest.MockedFunction<typeof createClientStateManager>;

describe('AIStateProvider', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let mockStateManager: jest.Mocked<StateManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      sendMessage: jest.fn(),
      healthCheck: jest.fn(),
      getDefaultStreamingHandler: jest.fn()
    } as jest.Mocked<IAIClient>;

    mockStateManager = {
      sendMessage: jest.fn(),
      setActiveConversationId: jest.fn(),
      getActiveConversationMessages: jest.fn().mockReturnValue([]),
      getMessageInProgress: jest.fn().mockReturnValue(false),
      getState: jest.fn().mockReturnValue({
        conversations: {},
        activeConversationId: null,
        messageInProgress: false
      }),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    } as jest.Mocked<StateManager>;

    mockCreateClientStateManager.mockReturnValue(mockStateManager);
  });

  describe('Provider Creation', () => {
    it('should create state manager from client when only client is provided', () => {
      const TestComponent = () => {
        const context = React.useContext(AIStateContext);
        return <div data-testid="test">{typeof context.getState}</div>;
      };

      render(
        <AIStateProvider client={mockClient}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(mockCreateClientStateManager).toHaveBeenCalledWith(mockClient);
      expect(screen.getByTestId('test')).toHaveTextContent('function');
    });

    it('should use provided state manager when stateManager is provided', () => {
      const TestComponent = () => {
        const context = React.useContext(AIStateContext);
        const stateManager = context.getState();
        return <div data-testid="test">{stateManager === mockStateManager ? 'same' : 'different'}</div>;
      };

      render(
        <AIStateProvider stateManager={mockStateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(mockCreateClientStateManager).not.toHaveBeenCalled();
      expect(screen.getByTestId('test')).toHaveTextContent('same');
    });

    it('should prefer stateManager over client when both are provided', () => {
      const TestComponent = () => {
        const context = React.useContext(AIStateContext);
        const stateManager = context.getState();
        return <div data-testid="test">{stateManager === mockStateManager ? 'same' : 'different'}</div>;
      };

      render(
        <AIStateProvider stateManager={mockStateManager} client={mockClient}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(mockCreateClientStateManager).not.toHaveBeenCalled();
      expect(screen.getByTestId('test')).toHaveTextContent('same');
    });

    it('should throw error when neither stateManager nor client is provided', () => {
      const originalConsoleError = console.error;
      console.error = jest.fn(); // Suppress error logs in test output

      expect(() => {
        render(
          <AIStateProvider>
            <div>Test</div>
          </AIStateProvider>
        );
      }).toThrow('AIStateProvider requires either a stateManager or a client');

      console.error = originalConsoleError;
    });
  });

  describe('Context Value', () => {
    it('should provide getState function in context', () => {
      const TestComponent = () => {
        const context = React.useContext(AIStateContext);
        return (
          <div>
            <div data-testid="hasGetState">{typeof context.getState}</div>
            <div data-testid="stateManager">{context.getState() === mockStateManager ? 'correct' : 'incorrect'}</div>
          </div>
        );
      };

      render(
        <AIStateProvider stateManager={mockStateManager}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(screen.getByTestId('hasGetState')).toHaveTextContent('function');
      expect(screen.getByTestId('stateManager')).toHaveTextContent('correct');
    });

    it('should recreate state manager when client changes', () => {
      const newMockClient = {
        sendMessage: jest.fn(),
        healthCheck: jest.fn(),
        getDefaultStreamingHandler: jest.fn()
      } as jest.Mocked<IAIClient>;

      const newMockStateManager = {
        sendMessage: jest.fn(),
        setActiveConversationId: jest.fn(),
        getActiveConversationMessages: jest.fn().mockReturnValue([]),
        getMessageInProgress: jest.fn().mockReturnValue(false),
        getState: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn()
      } as jest.Mocked<StateManager>;

      mockCreateClientStateManager
        .mockReturnValueOnce(mockStateManager)
        .mockReturnValueOnce(newMockStateManager);

      const TestComponent = () => {
        const context = React.useContext(AIStateContext);
        const stateManager = context.getState();
        return <div data-testid="stateManager">{stateManager === newMockStateManager ? 'new' : 'old'}</div>;
      };

      const { rerender } = render(
        <AIStateProvider client={mockClient}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(screen.getByTestId('stateManager')).toHaveTextContent('old');

      rerender(
        <AIStateProvider client={newMockClient}>
          <TestComponent />
        </AIStateProvider>
      );

      expect(screen.getByTestId('stateManager')).toHaveTextContent('new');
      expect(mockCreateClientStateManager).toHaveBeenCalledTimes(2);
      expect(mockCreateClientStateManager).toHaveBeenNthCalledWith(1, mockClient);
      expect(mockCreateClientStateManager).toHaveBeenNthCalledWith(2, newMockClient);
    });
  });

  describe('Children Rendering', () => {
    it('should render children correctly', () => {
      render(
        <AIStateProvider stateManager={mockStateManager}>
          <div data-testid="child">Test Child</div>
        </AIStateProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Test Child');
    });

    it('should render multiple children correctly', () => {
      render(
        <AIStateProvider stateManager={mockStateManager}>
          <div data-testid="child1">Child 1</div>
          <div data-testid="child2">Child 2</div>
        </AIStateProvider>
      );

      expect(screen.getByTestId('child1')).toHaveTextContent('Child 1');
      expect(screen.getByTestId('child2')).toHaveTextContent('Child 2');
    });
  });
}); 