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
- **CRITICAL**: All tests must be verified to actually work by running them before committing

### **Package Testing Requirements**
- Unit tests for all public APIs within individual packages
- Integration tests for cross-package workflows and data flow
- Error scenario coverage at both unit and integration levels
- Streaming/async functionality testing

### **Unit vs Integration Testing Guidelines**

#### **Unit Tests (Package-Level)**
Use unit tests within individual packages (`packages/*/src/**/*.spec.ts`) for:
- Testing individual class methods and functions in isolation
- **ALWAYS use mocked fetch/APIs** - No external servers required
- Testing package-specific error handling
- Validating individual component behavior

Example: Testing ARH client's `sendMessage` method with mocked fetch

#### **Integration Tests (Cross-Package)**
Use integration tests in `apps/client-integration-tests` for:
- **Data Flow Testing**: Verify data flows correctly between packages (e.g., additional attributes from ARH client → state manager)
- **Cross-Package Interactions**: Test how packages work together (client + state manager)
- **End-to-End Workflows**: Complete user scenarios involving multiple packages
- **Type Compatibility**: Ensure interfaces work correctly across package boundaries

**CRITICAL**: Integration tests **MUST ALWAYS use mock servers, NOT mocked APIs** when available:
- **Real streaming tests**: Use ARH mock server (`npm run arh-mock-server`) for realistic streaming behavior
- **Complex workflows**: Mock servers provide more realistic responses and error scenarios
- **Fallback to mocked APIs**: Only when mock servers are not available or for simple unit test style integration tests

Example: Testing that ARH client's `additionalAttributes` are properly preserved through the state manager

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

### **Mocked API Integration Tests**

#### **When Using Mocked APIs in Integration Tests**
When integration tests must use mocked APIs (instead of mock servers):

- **Mock conversation history calls**: Always mock the `getConversationHistory` endpoint when using `setActiveConversationId`
- **Mock all required endpoints**: Ensure all API calls triggered by the integration flow are mocked
- **Use realistic response structures**: Mock responses should match the actual API schema

```typescript
// Example: Mock conversation history for setActiveConversationId
mockFetch.mockResolvedValueOnce({
  ok: true,
  status: 200,
  json: async () => [], // Empty history for new conversation
  headers: new Headers({ 'content-type': 'application/json' }),
} as Response);

await stateManager.setActiveConversationId(conversationId);
```

#### **Common Integration Test Mock Patterns**
```typescript
// Mock sequence for conversation setup + message sending
mockFetch
  .mockResolvedValueOnce({
    // First call: conversation history
    ok: true,
    status: 200,
    json: async () => [],
  } as Response)
  .mockResolvedValueOnce({
    // Second call: send message response
    ok: true,
    status: 200,
    json: async () => ({
      message_id: 'msg-1',
      answer: 'Response text',
      conversation_id: 'conv-1',
      received_at: new Date().toISOString(),
      sources: [],
    }),
  } as Response);
```

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

#### **Real Mock Server Integration Tests**
For integration tests that use actual mock servers instead of mocked fetch responses:

```typescript
describe('Real Mock Server Integration Tests', () => {
  let client: AnsibleLightspeedClient;
  const mockServerUrl = 'http://localhost:3003';

  beforeEach(() => {
    client = new AnsibleLightspeedClient({
      baseUrl: mockServerUrl,
      // No mockFetch - use real fetch to hit mock server
    });
  });

  beforeAll(async () => {
    // Health check to ensure mock server is running
    try {
      const response = await fetch(`${mockServerUrl}/v1/info`);
      if (!response.ok) {
        throw new Error('Mock server not responding');
      }
    } catch (error) {
      throw new Error(
        `Mock server not running at ${mockServerUrl}. Start it with: node mock-server.js`
      );
    }
  });

  it('should receive real streaming response from mock server', async () => {
    const events: StreamingEvent[] = [];
    const queryRequest: QueryRequest = {
      query: 'How do I use Ansible modules?',
    };

    const stream = await client.streamingQuery(queryRequest);
    
    await processStreamWithHandler(stream, {
      onEvent: (event) => events.push(event),
      onError: (error) => fail(`Stream error: ${error.message}`),
    });

    // Verify realistic server response structure
    expect(events.length).toBeGreaterThan(0);
    
    const startEvents = events.filter((e) => e.event === 'start');
    const tokenEvents = events.filter((e) => e.event === 'token');
    const endEvents = events.filter((e) => e.event === 'end');
    
    expect(startEvents).toHaveLength(1);
    expect(tokenEvents.length).toBeGreaterThan(0);
    expect(endEvents).toHaveLength(1);
  });
});
```

**Key Differences from Mocked Tests:**
- No `mockFetch` or `jest.fn()` setup
- Real HTTP calls to actual mock server
- Health check in `beforeAll` to ensure server availability
- Clear error messages when server is not running
- Tests real streaming behavior, not mocked responses

### **Mock Server vs Mocked Fetch: Best Practices**

**TL;DR**: Use mock servers for integration tests, mocked fetch only for isolated unit tests.

#### **When to Prefer Mock Servers Over Mocked Fetch**

Based on practical experience, mock servers should be strongly preferred over mocked fetch functions for integration tests:

**✅ Prefer Mock Servers When:**
- Testing integration flows that involve multiple API calls
- Testing state manager + client interactions
- Testing conversation flows (create → setActive → sendMessage)
- Testing streaming functionality
- When the test requires realistic HTTP behavior

**❌ Avoid Mocked Fetch When:**
- Multiple sequential API calls are required
- Complex conversation setup is involved
- Network timing and behavior matter for the test
- Tests become unreliable due to mock sequencing issues

#### **Common Mocked Fetch Problems**

```typescript
// ❌ PROBLEMATIC: Complex mock sequences are fragile
mockFetch
  .mockResolvedValueOnce(historyResponse)  // Call 1: getConversationHistory
  .mockResolvedValueOnce(sendResponse);    // Call 2: sendMessage
  
// If any internal call changes order, the entire test breaks
await stateManager.setActiveConversationId(conversationId);
await stateManager.sendMessage(userMessage);
```

```typescript
// ✅ BETTER: Use mock server for reliable integration tests
const mockServerBaseUrl = 'http://localhost:3001';
const realClient = new IFDClient({ baseUrl: mockServerBaseUrl });
const realStateManager = createClientStateManager(realClient);

// Create conversation first (required by mock server)
const conversation = await realClient.createConversation();
await realStateManager.setActiveConversationId(conversation.conversation_id);

// Test actual functionality with real HTTP calls
const response = await realStateManager.sendMessage('Test message');
```

#### **Required Pattern for Mock Server Integration Tests**

**CRITICAL**: Always create conversations first when using mock servers:

```typescript
// ✅ CORRECT: Create conversation before setting active
const conversation = await realClient.createConversation();
await realStateManager.setActiveConversationId(conversation.conversation_id);

// ❌ WRONG: Setting arbitrary conversation IDs fails
await realStateManager.setActiveConversationId('conv-arbitrary-123'); // 404 error
```

#### **Error Injection with Mock Servers**

Use request headers in the `sendMessage` options parameter for targeted error injection:

```typescript
// ✅ Targeted error injection using sendMessage options
await expect(
  realStateManager.sendMessage('Error message', {
    headers: {
      'x-mock-server-error': 'true',     // Triggers 500 response
      'x-mock-error-message': 'Custom error text'
    },
  })
).rejects.toThrow();

// ✅ Streaming error injection
await expect(
  realStateManager.sendMessage('Stream error', {
    headers: {
      'x-mock-error-after-chunks': '0',  // Immediate error
      'x-mock-error-message': 'Streaming error'
    },
  })
).rejects.toThrow();
```

#### **Migration Strategy: Mocked Fetch → Mock Server**

When converting existing mocked fetch tests to mock server tests:

1. **Replace client setup**:
   ```typescript
   // Before
   const mockFetch = jest.fn();
   const client = new IFDClient({ baseUrl: 'https://api.test.com', fetchFunction: mockFetch });
   
   // After  
   const realClient = new IFDClient({ baseUrl: 'http://localhost:3001' });
   ```

2. **Add conversation creation**:
   ```typescript
   // Add this before setActiveConversationId
   const conversation = await realClient.createConversation();
   await realStateManager.setActiveConversationId(conversation.conversation_id);
   ```

3. **Update assertions to be flexible**:
   ```typescript
   // Before: Exact mock values
   expect(response.messageId).toBe('msg-123');
   
   // After: Flexible real values
   expect(response.messageId).toBeDefined();
   expect(response.answer).toBeDefined();
   ```

4. **Remove all mockFetch setup and cleanup**

#### **When to Keep Mocked Fetch (Unit Tests)**

Mocked fetch is still appropriate for true unit tests:

```typescript
// ✅ GOOD: Unit test with mocked fetch for isolated testing
describe('IFDClient Unit Tests', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let client: IFDClient;

  beforeEach(() => {
    mockFetch = jest.fn();
    client = new IFDClient({
      baseUrl: 'https://api.test.com',
      fetchFunction: mockFetch
    });
  });

  it('should handle HTTP 500 errors correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error'
    } as Response);

    await expect(client.sendMessage('conv-123', 'Hello'))
      .rejects.toThrow('API request failed: 500 Internal Server Error');
  });
});
```

**Use mocked fetch for:**
- Testing specific error conditions and edge cases
- Testing client method behavior in isolation
- Testing error handling logic
- When you need precise control over response timing and values
- Unit tests that focus on a single class/method

**Use mock servers for:**
- Integration tests involving multiple components
- Testing realistic request/response flows
- Testing conversation management across multiple API calls
- When testing state management + client interactions

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

#### **TypeScript Union Type Handling in Streaming Tests**
When working with streaming events that use union types, TypeScript cannot infer specific event types after filtering. Use type assertions with proper imports:

```typescript
// Import specific event types
import type {
  StreamingEvent,
  TokenEvent,
  TurnCompleteEvent,
} from '@redhat-cloud-services/ansible-lightspeed';

it('should handle token events with proper typing', async () => {
  const tokenEvents: StreamingEvent[] = [];
  let fullResponse = '';

  const onEvent: StreamingEventHandler = (event) => {
    if (event.event === 'token') {
      // Type assertion needed for union types
      const tokenEvent = event as TokenEvent;
      tokenEvents.push(tokenEvent);
      fullResponse += tokenEvent.data.token;
    } else if (event.event === 'turn_complete') {
      const turnCompleteEvent = event as TurnCompleteEvent;
      fullResponse = turnCompleteEvent.data.token;
    }
  };

  // Later in test...
  tokenEvents.forEach((event, index) => {
    const tokenEvent = event as TokenEvent;
    expect(tokenEvent.data).toHaveProperty('token');
    expect(typeof tokenEvent.data.token).toBe('string');
  });
});
```

**Why this is needed:**
- TypeScript union types require explicit type assertions to access type-specific properties
- Filtering by event type doesn't automatically narrow the type
- Type assertions are safe when used after type guards (event.event === 'token')

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