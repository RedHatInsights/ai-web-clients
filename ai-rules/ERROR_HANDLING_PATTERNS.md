# Error Handling Patterns
## AI Web Clients NX Workspace

> Part of the modular AI context system. See [AI_CONTEXT.md](./AI_CONTEXT.md) for overview.

---

## 🧪 ERROR HANDLING AND RECOVERY PATTERNS (CRITICAL)

### **Error Handling Architecture**

#### **Client Initialization Error Handling**
- **Standardized Error Format**: All clients must throw `IInitErrorResponse` objects during initialization failures
- **Error Structure**: `{ message: string, status: number }`
- **Type Guard**: Use `isInitErrorResponse(error)` to validate error format
- **Error Transformation**: Convert `AIClientError` instances to `IInitErrorResponse` format before throwing

```typescript
// CORRECT pattern for client initialization error handling:
try {
  // initialization logic
} catch (error) {
  const errorResponse: IInitErrorResponse = {
    message: error instanceof AIClientError ? error.message : JSON.stringify(error),
    status: error instanceof AIClientError ? error.status : 500
  };
  throw errorResponse;
}
```

#### **State Manager Error Recovery** (CRITICAL)
- **Graceful Degradation**: State managers must remain functional after initialization errors
- **User Feedback**: Display error messages as bot messages in conversations
- **State Consistency**: Set `isInitialized = true` even after errors so users can see error messages
- **Error Conversation**: Auto-create conversation context for displaying error messages to users

```typescript
// CORRECT pattern for state manager error handling:
try {
  await client.init();
  state.isInitialized = true;
} catch (error) {
  state.isInitialized = true; // CRITICAL: Still mark as initialized
  const errorMessage: Message<T> = {
    id: crypto.randomUUID(),
    answer: isInitErrorResponse(error) ? error.message : JSON.stringify(error),
    role: 'bot',
  };
  // Create conversation context and add error message
  const conversationId = state.activeConversationId || crypto.randomUUID();
  if (!state.conversations[conversationId]) {
    initializeConversationState(conversationId);
  }
  state.conversations[conversationId].messages.push(errorMessage);
  state.activeConversationId = conversationId;
  throw error; // Re-throw for caller awareness
}
```

### **Async Race Condition Patterns** (CRITICAL)

#### **Common Race Condition: Async Functions with Void Return**
A critical race condition pattern occurs when async functions have `void` return types, causing callers not to wait for completion:

```typescript
// ❌ DANGEROUS - Race condition prone
interface StateManager {
  setActiveConversationId(id: string): void; // Async operation but void return
}

async function setActiveConversationId(id: string): void {
  state.activeConversationId = id;
  // Async history fetching runs in background
  const history = await client.getConversationHistory(id);
  state.conversations[id].messages = history; // Can overwrite messages added after call
}

// Usage creates race condition:
stateManager.setActiveConversationId('conv-123'); // Doesn't wait
stateManager.sendMessage('Hello'); // Adds message immediately
// History fetch completes and overwrites the message
```

#### **Correct Pattern: Async Functions Return Promises**
```typescript
// ✅ CORRECT - Prevents race conditions
interface StateManager {
  setActiveConversationId(id: string): Promise<void>; // Returns Promise
}

async function setActiveConversationId(id: string): Promise<void> {
  state.activeConversationId = id;
  const history = await client.getConversationHistory(id);
  state.conversations[id].messages = history;
  // Function completes before caller continues
}

// Usage prevents race condition:
await stateManager.setActiveConversationId('conv-123'); // Waits for completion
stateManager.sendMessage('Hello'); // Safe to add messages now
```

#### **Race Condition Detection Signs**
- Messages disappearing after being added to conversations
- Tests failing intermittently due to timing issues  
- Async operations appearing to "undo" previous operations
- Functions that are async but have `void` return types

#### **Testing Race Conditions**
- **Always await async state operations** in tests: `await stateManager.setActiveConversationId(id)`
- **Update function signatures** from `() => void` to `async () => void` when calling awaited functions
- **Update beforeEach hooks** to be async when they contain await calls
- **Verify message persistence** after async operations complete

### **Testing Error Handling** (CRITICAL)

#### **Mock Server Error Injection Patterns**
- **Custom Headers**: Use custom headers to trigger specific error scenarios
- **Standard Pattern**: `x-mock-{error-type}: true` for boolean flags
- **Parameterized Errors**: `x-mock-error-after-chunks: 3` for conditional errors
- **Error Messages**: `x-mock-error-message: "Custom error text"` for specific error content

```typescript
// Mock server error injection example:
const errorClient = new IFDClient({
  baseUrl: mockServerBaseUrl,
  fetchFunction: createMockServerFetch({
    'x-mock-unauthorized': 'true', // Triggers 403 response
    'x-mock-error-after-chunks': '2', // Error after 2 streaming chunks
    'x-mock-error-message': 'Custom error for testing'
  })
});
```

#### **Unit Test Error Patterns**
- **Mock Rejections**: Use `mockRejectedValue()` for simulating client failures
- **Error Assertions**: Use `toEqual()` with exact `IInitErrorResponse` objects, not partial matches
- **State Verification**: After errors, verify state manager remains functional and shows error messages

```typescript
// CORRECT unit test pattern for initialization errors:
it('should handle initialization errors properly', async () => {
  const initError = new Error('Initialization failed');
  mockClient.init = jest.fn().mockRejectedValue(initError);
  
  await expect(stateManager.init()).rejects.toThrow('Initialization failed');
  
  // Verify state manager remains functional
  expect(stateManager.isInitialized()).toBe(true); // CRITICAL: Should be true
  expect(stateManager.isInitializing()).toBe(false);
  
  // Verify error message displayed to user
  const messages = stateManager.getActiveConversationMessages();
  expect(messages.length).toBe(1);
  expect(messages[0].role).toBe('bot');
  expect(messages[0].answer).toBe('{}'); // JSON.stringify of Error objects
});
```

#### **Integration Test Error Patterns**
- **Real Error Scenarios**: Test actual error conditions using mock server capabilities
- **End-to-End Verification**: Verify error handling from client through state manager to user interface
- **Recovery Testing**: Test that applications can recover after fixing error conditions

```typescript
// Integration test pattern for error handling:
it('should display error message to user when initialization fails', async () => {
  const client = new IFDClient({
    baseUrl: mockServerBaseUrl,
    fetchFunction: createMockServerFetch({
      'x-mock-unauthorized': 'true'
    })
  });

  const stateManager = createClientStateManager(client);

  try {
    await stateManager.init();
    fail('Expected init error');
  } catch (error) {
    expect(isInitErrorResponse(error)).toBe(true);
  }

  // Verify user sees error message
  expect(stateManager.isInitialized()).toBe(true);
  const messages = stateManager.getActiveConversationMessages();
  expect(messages[0].answer).toBe('API request failed: 403 Forbidden');
});
```

### **Critical Error Handling Gotchas**

1. **JSON.stringify Error Objects**: Error objects stringify to `"{}"` - use `error.message` or custom formatting
2. **State Manager Initialization**: After errors, `isInitialized` should be `true` for user feedback
3. **Error Type Guards**: Always use `isInitErrorResponse()` for proper error type checking
4. **Mock Server Dependencies**: Integration tests require mock server to be running
5. **Test Isolation**: Each test should clean up state and not affect other tests

### **Conversation Locking Error Handling**

When conversations are locked, the system should handle message attempts gracefully:

```typescript
// Locked conversation error handling pattern:
if (conversation.locked) {
  console.error('Cannot send message in a locked conversation');
  const lockedMessage: Message<T> = {
    id: crypto.randomUUID(),
    answer: 'This conversation is locked and cannot accept new messages.',
    role: 'bot'
  };
  conversation.messages.push(lockedMessage);
  notify(Events.MESSAGE);
  state.messageInProgress = false;
  notify(Events.IN_PROGRESS);
  return; // Don't call client.sendMessage
}
```

### **Error Recovery Strategies**

#### **Client-Level Recovery**
- **Retry Logic**: Implement exponential backoff for transient failures
- **Circuit Breaker**: Stop making requests after repeated failures
- **Fallback Responses**: Provide meaningful fallback when services are unavailable

#### **State Manager Recovery**
- **Graceful Degradation**: Continue functioning even if initialization fails
- **User Communication**: Always show error messages to users in conversation context
- **State Consistency**: Maintain consistent state even during error conditions

#### **Application-Level Recovery**
- **Error Boundaries**: Use React error boundaries to catch component errors
- **Retry Mechanisms**: Allow users to retry failed operations
- **Offline Support**: Provide offline functionality when possible

---

## 🚨 CRITICAL ERROR PATTERNS TO AVOID

### **Anti-Patterns**
- **Silent Failures**: Never fail silently - always provide user feedback
- **Incomplete State**: Don't leave state managers in partially initialized states
- **Missing Awaits**: Always await async operations in sequence-dependent code
- **Race Conditions**: Never have async functions with void return types
- **Test Pollution**: Tests should not affect each other's state

### **Common Mistakes**
- Setting `isInitialized = false` after errors (should be `true` for user feedback)
- Not converting Error objects to user-friendly messages
- Forgetting to await async state operations in tests
- Using direct error objects instead of standardized error responses

---

> For testing strategies, see [TESTING_STRATEGIES.md](./TESTING_STRATEGIES.md)  
> For development guidelines, see [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)  
> For package patterns, see [PACKAGE_PATTERNS.md](./PACKAGE_PATTERNS.md)