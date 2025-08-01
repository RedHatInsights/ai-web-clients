# Testing Strategies
## AI Web Clients NX Workspace

> Part of the modular AI context system. See [AI_CONTEXT.md](./AI_CONTEXT.md) for overview.

---

## 🧪 TESTING STRATEGY

### **Workspace Testing Approach**
- Jest as primary testing framework
- Shared configuration via `jest.preset.js`
- Mock external dependencies consistently
- Professional test descriptions (no emojis)

### **Package Testing Requirements**
- Unit tests for all public APIs
- Integration tests for complex workflows
- Error scenario coverage
- Streaming/async functionality testing

### **Integration Testing Approach**
- **Integration Test App**: `apps/client-integration-tests` validates package interoperability
- **NX MCP Integration**: Use NX MCP tools to generate test applications instead of manual creation
- **Cross-Package Testing**: Verify that packages work together correctly (ARH client + state manager)
- **Environment Limitations**: Node.js Jest environment has limitations with Web APIs (ReadableStream, etc.)

### **Test Organization**
```
src/lib/
├── __tests__/         # Test files (optional pattern)
├── feature.spec.ts    # Co-located tests (preferred)
└── feature.ts         # Source files

apps/
└── client-integration-tests/  # Cross-package integration tests
    └── src/
        └── *.spec.ts           # Integration test suites
```

### **React Testing Patterns** (CRITICAL)

When working with the `ai-react-state` package and React Testing Library:

#### **Context Switching Tests**
- **NEVER use `renderHook` with `rerender` for context changes** - it doesn't properly switch contexts
- **ALWAYS use actual React components** for testing context switching

```typescript
// ❌ WRONG - renderHook doesn't handle context switching properly
const { result, rerender } = renderHook(() => useHook(), { wrapper: wrapper1 });
rerender({ wrapper: wrapper2 }); // Context doesn't actually switch

// ✅ CORRECT - Use actual React components
const TestComponent = () => {
  const value = useHook();
  return <div data-testid="value">{value || 'null'}</div>;
};

const { unmount, getByTestId } = render(<TestComponent />, { wrapper: wrapper1 });
// ... test first context
unmount(); // Completely tear down React tree

const { getByTestId: getByTestId2 } = render(<TestComponent />, { wrapper: wrapper2 });
// Fresh React tree with new context
```

#### **State Manager Prerequisites**
- **ALWAYS set active conversation** before testing message sending: `await stateManager.setActiveConversationId('test-id')`
- The state manager requires an active conversation before `sendMessage()` calls
- Use unique conversation IDs for each test to avoid cross-test interference

#### **Jest Spy Expectations**
- When testing function calls without optional parameters, use `toHaveBeenCalledWith(param)` not `toHaveBeenCalledWith(param, undefined)`
- JavaScript functions called with fewer parameters don't explicitly pass `undefined` to spy mocks

#### **When to Use Each Approach**
- **`renderHook`**: For testing hooks within the same context (state changes, event handling)
- **React components with `render`**: For testing context switching, provider changes, unmounting behavior

#### **Testing with Real vs Mocked Dependencies**
- **Use real state managers**: `createClientStateManager(mockClient)` instead of manually mocked objects
- **Use `jest.spyOn()`**: Spy on real methods instead of mocking entire objects
- **Always clean up spies**: Call `spy.mockRestore()` after each test

### **Test Server Lifecycle Management** (CRITICAL - DO NOT MODIFY)
**NEVER add server lifecycle management to Cypress tests:**
- **NO `pkill` commands** - Don't kill/restart servers in tests
- **NO `cy.exec()` server management** - Server lifecycle is handled externally
- **NO server startup/shutdown** - Tests assume servers are already running
- **Focus on API testing only** - Tests should verify application behavior, not manage infrastructure

**Why this matters:**
- Server lifecycle is managed by developers/CI systems
- Tests should be focused on application logic, not infrastructure
- Killing servers mid-test can affect other running tests
- Server management belongs in setup scripts, not test code

### **Mock Server Testing Patterns**

#### **Mock Server Error Injection**
Use custom headers to trigger specific error scenarios:

```typescript
// Standard patterns for error injection
const errorClient = new IFDClient({
  baseUrl: mockServerBaseUrl,
  fetchFunction: createMockServerFetch({
    'x-mock-unauthorized': 'true',        // Triggers 403 response
    'x-mock-server-error': 'true',        // Triggers 500 response
    'x-mock-network-error': 'true',       // Triggers network failure
    'x-mock-error-after-chunks': '2',     // Error after N streaming chunks
    'x-mock-error-message': 'Custom error text' // Custom error content
  })
});
```

#### **Mock Server Lifecycle**
- Mock servers should be started before test suites
- Tests assume servers are already running and healthy
- Use health check endpoints to verify server availability
- Each test should be independent and not require server restarts

### **Unit Testing Patterns**

#### **Client Testing**
```typescript
describe('Client Tests', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let client: IFDClient;

  beforeEach(() => {
    mockFetch = jest.fn();
    client = new IFDClient({
      baseUrl: 'https://api.test.com',
      fetchFunction: mockFetch
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle successful responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'success' })
    } as Response);

    const result = await client.sendMessage('conv-123', 'Hello');
    expect(result).toBeDefined();
  });
});
```

#### **State Manager Testing**
```typescript
describe('State Manager Tests', () => {
  let mockClient: jest.Mocked<IAIClient>;
  let stateManager: ReturnType<typeof createClientStateManager>;

  beforeEach(() => {
    mockClient = {
      init: jest.fn().mockResolvedValue({
        initialConversationId: 'test-conversation-id',
        conversations: []
      }),
      sendMessage: jest.fn(),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      // ... other required methods
    } as jest.Mocked<IAIClient>;

    stateManager = createClientStateManager(mockClient);
  });

  it('should handle message sending', async () => {
    await stateManager.setActiveConversationId('conv-123');
    
    mockClient.sendMessage.mockResolvedValue({
      messageId: 'msg-1',
      answer: 'Response',
      conversationId: 'conv-123'
    });

    const response = await stateManager.sendMessage('Hello');
    expect(response).toBeDefined();
  });
});
```

### **Integration Testing Patterns**

#### **Client + State Manager Integration**
```typescript
describe('Client Integration Tests', () => {
  let client: IFDClient;
  let stateManager: ReturnType<typeof createClientStateManager>;

  beforeEach(() => {
    client = new IFDClient({
      baseUrl: mockServerBaseUrl,
      fetchFunction: (input, init) => fetch(input, init)
    });
    stateManager = createClientStateManager(client);
  });

  it('should handle end-to-end message flow', async () => {
    await stateManager.setActiveConversationId('test-conv');
    
    const response = await stateManager.sendMessage('Hello integration test');
    
    expect(response).toBeDefined();
    const messages = stateManager.getActiveConversationMessages();
    expect(messages).toHaveLength(2); // User + bot message
  });
});
```

### **Async Testing Patterns**

#### **Race Condition Testing**
```typescript
// Test that async operations complete before subsequent operations
it('should wait for conversation setup before sending messages', async () => {
  // CRITICAL: Always await async state operations
  await stateManager.setActiveConversationId('conv-123');
  
  // Now safe to send messages
  const response = await stateManager.sendMessage('Hello');
  
  // Verify message persistence
  const messages = stateManager.getActiveConversationMessages();
  expect(messages).toContain(expect.objectContaining({
    answer: 'Hello',
    role: 'user'
  }));
});
```

#### **Streaming Testing**
```typescript
it('should handle streaming responses', async () => {
  const mockHandler = {
    onChunk: jest.fn(),
    onStart: jest.fn(),
    onComplete: jest.fn()
  };

  client = new IFDClient({
    baseUrl: mockServerBaseUrl,
    fetchFunction: (input, init) => fetch(input, init),
    defaultStreamingHandler: mockHandler
  });

  await stateManager.setActiveConversationId('stream-conv');
  
  const response = await stateManager.sendMessage('Stream this', { stream: true });
  
  expect(mockHandler.onStart).toHaveBeenCalled();
  expect(mockHandler.onComplete).toHaveBeenCalled();
});
```

### **Test Commands and Organization**

#### **Running Tests**
```bash
# Run all tests with clean output
NX_TUI=false npx nx run-many --target=test --all

# Run specific package tests
npx nx run arh-client:test
npx nx run ai-client-state:test

# Run integration tests
npx nx run client-integration-tests:test

# Run with coverage
npx nx run arh-client:test --coverage

# Run specific test file
npx nx run arh-client:test --testPathPattern="client.spec.ts"
```

#### **Test File Organization**
- Co-locate tests with source files (preferred)
- Use descriptive test names without emojis
- Group related tests in describe blocks
- Clean up resources in afterEach hooks

### **Error Testing Patterns**

#### **Testing Error Recovery**
```typescript
it('should remain functional after initialization errors', async () => {
  mockClient.init.mockRejectedValue(new Error('Init failed'));
  
  await expect(stateManager.init()).rejects.toThrow('Init failed');
  
  // State manager should still be functional
  expect(stateManager.isInitialized()).toBe(true);
  
  // Should display error to user
  const messages = stateManager.getActiveConversationMessages();
  expect(messages).toHaveLength(1);
  expect(messages[0].role).toBe('bot');
});
```

#### **Testing Race Conditions**
```typescript
it('should not lose messages due to race conditions', async () => {
  // Simulate slow history fetch
  mockClient.getConversationHistory.mockImplementation(
    () => new Promise(resolve => setTimeout(() => resolve([]), 100))
  );
  
  // This should wait for history fetch to complete
  await stateManager.setActiveConversationId('conv-race');
  
  // Add message after setup is complete
  mockClient.sendMessage.mockResolvedValue({
    messageId: 'msg-1',
    answer: 'Response',
    conversationId: 'conv-race'
  });
  
  await stateManager.sendMessage('Test message');
  
  // Message should persist (not be overwritten by history fetch)
  const messages = stateManager.getActiveConversationMessages();
  expect(messages).toContain(expect.objectContaining({
    answer: 'Test message',
    role: 'user'
  }));
});
```

---

## 🚨 TESTING GOTCHAS AND COMMON ISSUES

### **React Testing Issues**
- `renderHook` with `rerender` doesn't properly switch contexts
- Always use actual React components for context switching tests
- Clean up spies and mocks between tests

### **Async Testing Issues**
- Always await async state operations in tests
- Race conditions can cause intermittent test failures
- Verify state persistence after async operations

### **Mock Server Issues**
- Tests assume servers are already running
- Use health check endpoints to verify availability
- Don't manage server lifecycle in tests

### **State Manager Issues**
- Set active conversation before testing message sending
- Use unique conversation IDs to avoid test interference
- Verify state consistency after error conditions

---

> For error handling patterns, see [ERROR_HANDLING_PATTERNS.md](./ERROR_HANDLING_PATTERNS.md)  
> For development guidelines, see [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)  
> For package patterns, see [PACKAGE_PATTERNS.md](./PACKAGE_PATTERNS.md)