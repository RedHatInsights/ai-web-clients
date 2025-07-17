# Client Integration Tests

Integration test application for validating package interoperability and live API server testing.

## Overview

This application contains comprehensive integration tests for AI client packages in the workspace:

- **ARH Client Tests**: Tests for `@redhat-cloud-services/arh-client`
- **Lightspeed Client Tests**: Tests for `@redhat-cloud-services/lightspeed-client` ✨ NEW
- **State Manager Integration**: Tests for `@redhat-cloud-services/ai-client-state`

## Test Suites

### 1. Mocked Integration Tests (Always Run)

These tests use mocked HTTP responses and don't require external servers:

- `arh-client-state-integration.spec.ts` - ARH client with state manager
- `lightspeed-client-state-integration.spec.ts` - Lightspeed client with state manager

### 2. Live Server Integration Tests (Optional)

These tests connect to actual running servers for end-to-end validation:

- `arh-streaming-integration.spec.ts` - ARH client with mock server
- `lightspeed-streaming-integration.spec.ts` - Lightspeed client with live server

## Running Tests

### Run All Integration Tests

```bash
npx nx test client-integration-tests
```

### Run Specific Test Suites

```bash
# ARH client tests only
npx nx test client-integration-tests --testPathPattern="arh-client-state"

# Lightspeed client tests only  
npx nx test client-integration-tests --testPathPattern="lightspeed-client-state"

# Streaming tests only
npx nx test client-integration-tests --testPathPattern="streaming"
```

### Live Server Testing

#### For ARH Client Streaming Tests

1. Start the ARH mock server:
   ```bash
   npm run arh-mock-server
   ```

2. Run the streaming tests:
   ```bash
   npx nx test client-integration-tests --testPathPattern="arh-streaming"
   ```

#### For Lightspeed Client Live Tests

1. Start the Lightspeed API server on `localhost:8080`
   
2. Run the live integration tests:
   ```bash
   npx nx test client-integration-tests --testPathPattern="lightspeed-streaming"
   ```

**Note**: Live Lightspeed tests may require authentication. Tests will automatically skip if the server is not available or requires credentials.

## Test Architecture

### Mocked Tests Pattern

```typescript
// Example from lightspeed-client-state-integration.spec.ts
const mockFetch = jest.fn();
const client = new LightspeedClient({
  baseUrl: 'https://test.com',
  fetchFunction: mockFetch
});

mockFetch.mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => expectedResponse
});
```

### Live Server Tests Pattern  

```typescript
// Example from lightspeed-streaming-integration.spec.ts
const client = new LightspeedClient({
  baseUrl: 'http://localhost:8080',
  fetchFunction: fetch // Real fetch
});

// Tests include robust error handling for auth/config issues
try {
  const response = await client.sendMessage(id, 'test');
  // ... assertions
} catch (error) {
  pending('Server may require authentication');
}
```

### State Manager Integration

Both ARH and Lightspeed clients are tested with the state manager:

```typescript
const stateManager = createClientStateManager(client);
await stateManager.init();
stateManager.setActiveConversationId('test-id');
await stateManager.sendMessage(userMessage);

const messages = stateManager.getActiveConversationMessages();
// Verify conversation flow
```

## Test Coverage

### Lightspeed Client Features Tested

- ✅ Basic client instantiation and configuration
- ✅ Non-streaming message sending 
- ✅ Streaming message handling (with live server)
- ✅ Health checks (readiness + liveness)
- ✅ Error handling (401, 422, 500 responses)
- ✅ Feedback submission
- ✅ Authorization checking
- ✅ Custom headers and request options
- ✅ Request cancellation with AbortSignal
- ✅ State manager integration
- ✅ Event system integration
- ✅ Multi-message conversation flows

### ARH Client Features Tested

- ✅ Message sending (streaming and non-streaming)
- ✅ Custom streaming handlers
- ✅ State manager integration
- ✅ Error handling
- ✅ Multiple conversation support

## Troubleshooting

### Common Issues

1. **Tests timeout**: Increase Jest timeout for live server tests
2. **Server not available**: Live tests automatically skip if servers aren't running
3. **Authentication errors**: Expected for live servers that require auth
4. **Import errors**: Ensure all packages are built: `npx nx run-many --target=build --all`

### Server Requirements

- **ARH Mock Server**: Node.js server, configured in `arh-mock-server.js`
- **Lightspeed Server**: Actual OpenShift Lightspeed service on port 8080
- **Authentication**: Live servers may require valid credentials

## Development Guidelines

When adding new integration tests:

1. **Follow existing patterns** from ARH and Lightspeed tests
2. **Include both mocked and live server variants** when applicable  
3. **Use robust error handling** for live server tests
4. **Test state manager integration** for all AI clients
5. **Cover streaming and non-streaming modes**
6. **Verify conversation flow and events**
7. **Test error scenarios** and edge cases

## Architecture Benefits

- **Package Interoperability**: Ensures clients work with state managers
- **Real-world Validation**: Live server tests catch integration issues
- **Regression Prevention**: Comprehensive test coverage prevents breaking changes
- **Development Confidence**: Validates that workspace patterns work correctly 