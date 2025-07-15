# Client Integration Tests

This directory contains integration tests for the AI web clients along with an ARH-specific mock server that implements the ARH (Intelligent Front Door) API specification.

## ARH Mock Server

The ARH mock server (`arh-mock-server.js`) is a complete Express.js implementation of the ARH API based on the OpenAPI specification. It supports:

### Features
- ✅ All 10 API endpoints from the ARH OpenAPI spec v0.4.9
- ✅ Streaming and non-streaming message responses
- ✅ Realistic AI response generation with Red Hat context
- ✅ In-memory conversation storage
- ✅ Proper error handling and validation matching ARH API
- ✅ CORS support for browser testing
- 🔧 Specifically designed for testing `@redhat-cloud-services/arh-client`

### Endpoints

- `POST /api/ask/v1/conversation` - Create new conversation
- `POST /api/ask/v1/conversation/:id/message` - Send message (supports streaming)
- `GET /api/ask/v1/conversation/:id/history` - Get conversation history
- `POST /api/ask/v1/conversation/:id/message/:messageId/feedback` - Send feedback
- `GET /api/ask/v1/health` - Health check
- `GET /api/ask/v1/status` - Service status
- `GET /api/ask/v1/user/current` - Get user settings
- `PUT /api/ask/v1/user/current` - Update user settings
- `GET /api/ask/v1/user/current/history` - Get user history
- `GET /api/ask/v1/quota/conversation` - Get conversation quota
- `GET /api/ask/v1/quota/:conversationId/messages` - Get message quota

### Usage

#### Start the ARH mock server:
```bash
cd apps/client-integration-tests
npm run arh-mock-server
```

The server will start on `http://localhost:3001` by default.

#### Development mode with auto-restart:
```bash
npm run arh-mock-server:dev
```

#### Streaming Messages
To test streaming responses, send a message with `stream: true`:

```javascript
const response = await fetch('http://localhost:3001/api/ask/v1/conversation/:id/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input: 'Tell me about Red Hat OpenShift',
    stream: true
  })
});

// Handle streaming response
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = new TextDecoder().decode(value);
  const data = JSON.parse(chunk);
  console.log('Streaming chunk:', data);
}
```

## Integration Tests

The integration tests (`arh-client-state-integration.spec.ts`) test the interaction between:
- `@redhat-cloud-services/arh-client` - ARH API client
- `@redhat-cloud-services/ai-client-state` - State management
- Mock server responses

### Running Tests

```bash
# Run all integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with the ARH mock server
npm run arh-mock-server & npm test
```

### Test Coverage

- ✅ ARH client basic functionality
- ✅ Non-streaming message handling
- ✅ State manager integration
- ✅ Event system integration
- ✅ Error handling
- ✅ Multi-message conversation flows
- 🔄 Streaming message integration (with ARH mock server)

## Environment Variables

- `PORT` - ARH mock server port (default: 3001)

## Architecture Notes

This mock server is specifically designed for the ARH (Intelligent Front Door) client. Future AI clients (if any) should have their own dedicated mock servers to ensure proper isolation and API-specific testing.

## Dependencies

The ARH mock server requires:
- `express` - Web framework
- `uuid` - UUID generation
- `cors` - CORS middleware
- `nodemon` - Development auto-restart (dev dependency) 