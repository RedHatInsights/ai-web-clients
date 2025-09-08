#!/usr/bin/env node

/**
 * Lightspeed Mock Server
 *
 * This mock server implements the Lightspeed API specification for testing the
 * @redhat-cloud-services/lightspeed-client package and its integration with
 * the state management system.
 *
 * Based on Lightspeed OpenAPI spec version 0.2.0 (Lightspeed Core Service)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const {
  createMockLogger,
  logServerStart,
  logServerShutdown,
} = require('./shared/mock-logger');

const app = express();
const port = process.env.PORT || 3002;

const mockLogger = createMockLogger('LightSpeed', port);

// Middleware
app.use(cors());
app.use(express.json());
app.use(mockLogger);

// In-memory storage for conversations and feedback
const conversations = new Map();
const feedbackStorage = new Map();
const userInfo = {
  user_id: uuidv4(),
  username: 'testuser',
  skip_user_id_check: false,
};

// Service configuration matching OpenAPI spec
const serviceConfig = {
  name: 'Lightspeed Core Service',
  service: {
    host: 'localhost',
    port: 8080,
    auth_enabled: false,
    workers: 1,
    color_log: true,
    access_log: true,
    tls_config: {
      tls_certificate_path: 'config/certificate.crt',
      tls_key_path: 'config/private.key',
    },
    cors: {
      allow_origins: ['*'],
      allow_credentials: false,
      allow_methods: ['*'],
      allow_headers: ['*'],
    },
  },
  llama_stack: {
    url: 'http://localhost:8321',
    api_key: 'test-api-key',
    use_as_library_client: false,
  },
  user_data_collection: {
    feedback_enabled: true,
    feedback_storage: '/tmp/data/feedback',
    transcripts_enabled: false,
  },
  database: {
    sqlite: {
      db_path: '/tmp/lightspeed-stack.db',
    },
  },
  mcp_servers: [
    {
      name: 'server1',
      provider_id: 'provider1',
      url: 'http://url.com:1',
    },
    {
      name: 'server2',
      provider_id: 'provider2',
      url: 'http://url.com:2',
    },
  ],
  authentication: {
    module: 'noop',
    skip_tls_verification: false,
  },
  inference: {
    default_model: 'llama3.2:3b-instruct-fp16',
    default_provider: 'ollama',
  },
};

// Available models matching OpenAPI spec
const availableModels = [
  {
    identifier: 'all-MiniLM-L6-v2',
    metadata: {
      embedding_dimension: 384,
    },
    api_model_type: 'embedding',
    provider_id: 'ollama',
    provider_resource_id: 'all-minilm:latest',
    type: 'model',
    model_type: 'embedding',
  },
  {
    identifier: 'llama3.2:3b-instruct-fp16',
    metadata: {},
    api_model_type: 'llm',
    provider_id: 'ollama',
    provider_resource_id: 'llama3.2:3b-instruct-fp16',
    type: 'model',
    model_type: 'llm',
  },
];

// Service info matching OpenAPI spec
const serviceInfo = {
  name: 'Lightspeed Core Service',
  service_version: '0.2.0',
  llama_stack_version: '0.2.18',
};

// Feedback status state
let feedbackEnabled = true;

// Helper function to generate realistic AI responses
function generateAIResponse(input) {
  const responses = [
    `Based on your question about "${input}", here's what I can help you with regarding OpenShift...`,
    `That's a great question about "${input}". Let me provide you with some information about OpenShift...`,
    `Regarding "${input}" in OpenShift, I'd be happy to explain this topic...`,
    `Thank you for asking about "${input}". Here's a comprehensive answer about OpenShift...`,
  ];

  const baseResponse = responses[Math.floor(Math.random() * responses.length)];

  // Add some realistic OpenShift-specific continuation
  const continuations = [
    ' OpenShift is a comprehensive container platform built on Kubernetes that provides developers and IT operations teams with a complete solution for building, deploying, and managing applications.',
    ' This involves several key OpenShift concepts that are important to understand for effective implementation in your cluster environment.',
    ' Let me break this down into the most important OpenShift aspects you should know for your container workloads.',
    ' There are several approaches you can take in OpenShift, depending on your specific requirements and cluster configuration.',
  ];

  return (
    baseResponse +
    continuations[Math.floor(Math.random() * continuations.length)]
  );
}

// Helper function to create streaming chunks for plain text streaming
function createStreamingChunks(fullResponse) {
  const words = fullResponse.split(' ');
  const chunks = [];

  for (let i = 0; i < words.length; i++) {
    const currentChunk = words[i] + (i < words.length - 1 ? ' ' : '');

    // Send each word as a separate chunk for realistic streaming
    chunks.push({
      content: currentChunk,
      finished: i === words.length - 1,
    });
  }

  return chunks;
}

// GET / - Root endpoint
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html>
      <head><title>Lightspeed Core Service</title></head>
      <body>
        <h1>Lightspeed Core Service</h1>
        <p>Version: ${serviceInfo.service_version}</p>
        <p>Llama Stack Version: ${serviceInfo.llama_stack_version}</p>
        <ul>
          <li><a href="/v1/info">Service Info</a></li>
          <li><a href="/v1/models">Available Models</a></li>
          <li><a href="/v1/config">Configuration</a></li>
          <li><a href="/v1/conversations">Conversations</a></li>
          <li><a href="/v1/feedback/status">Feedback Status</a></li>
          <li><a href="/readiness">Readiness</a></li>
          <li><a href="/liveness">Liveness</a></li>
          <li><a href="/metrics">Metrics</a></li>
        </ul>
      </body>
    </html>
  `);
});

// GET /v1/info - Service information
app.get('/v1/info', (req, res) => {
  res.json(serviceInfo);
});

// GET /v1/models - Available models
app.get('/v1/models', (req, res) => {
  res.json({
    models: availableModels,
  });
});

// GET /v1/config - Service configuration
app.get('/v1/config', (req, res) => {
  res.json(serviceConfig);
});

// GET /v1/conversations - List conversations
app.get('/v1/conversations', (req, res) => {
  const conversationList = Array.from(conversations.values()).map((conv) => ({
    conversation_id: conv.id,
    created_at: conv.created_at,
    last_message_at:
      conv.messages.length > 0
        ? conv.messages[conv.messages.length - 1].timestamp
        : conv.created_at,
    message_count: conv.messages.length,
    last_used_model: 'llama3.2:3b-instruct-fp16',
    last_used_provider: 'ollama',
  }));

  res.json({
    conversations: conversationList,
  });
});

// GET /v1/conversations/:conversation_id - Get specific conversation
app.get('/v1/conversations/:conversation_id', (req, res) => {
  const { conversation_id } = req.params;

  if (!conversations.has(conversation_id)) {
    return res.status(404).json({
      detail: {
        response: 'Conversation not found',
        cause: 'The specified conversation ID does not exist.',
      },
    });
  }

  const conversation = conversations.get(conversation_id);
  const chatHistory = conversation.messages.map((msg) => ({
    messages: [
      {
        content: msg.query,
        type: 'user',
      },
      {
        content: msg.response,
        type: 'assistant',
      },
    ],
    started_at: msg.timestamp,
    completed_at: new Date(
      new Date(msg.timestamp).getTime() + 5000
    ).toISOString(),
  }));

  res.json({
    conversation_id: conversation_id,
    chat_history: chatHistory,
  });
});

// DELETE /v1/conversations/:conversation_id - Delete conversation
app.delete('/v1/conversations/:conversation_id', (req, res) => {
  const { conversation_id } = req.params;

  if (!conversations.has(conversation_id)) {
    return res.status(404).json({
      detail: {
        response: 'Conversation not found',
        cause: 'The specified conversation ID does not exist.',
      },
    });
  }

  conversations.delete(conversation_id);

  res.json({
    conversation_id: conversation_id,
    success: true,
    response: 'Conversation deleted successfully',
  });
});

// POST /v1/query - Non-streaming conversation request
app.post('/v1/query', (req, res) => {
  const { query, conversation_id } = req.body;
  const { user_id } = req.query;

  // Validate required fields
  if (!query || typeof query !== 'string') {
    return res.status(422).json({
      detail: [
        {
          loc: ['body', 'query'],
          msg: 'Query is required and must be a string',
          type: 'value_error',
        },
      ],
    });
  }

  const conversationId = conversation_id || uuidv4();
  const aiResponse = generateAIResponse(query);

  // Store conversation if not exists
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      id: conversationId,
      messages: [],
      created_at: new Date().toISOString(),
    });
  }

  const response = {
    conversation_id: conversationId,
    response: aiResponse,
    referenced_documents: [
      {
        doc_url:
          'https://docs.openshift.com/container-platform/4.15/welcome/index.html',
        doc_title: 'Red Hat OpenShift Container Platform Documentation',
      },
      {
        doc_url:
          'https://docs.openshift.com/container-platform/4.15/operators/understanding/olm/olm-understanding-olm.html',
        doc_title: 'Operator Lifecycle Manager concepts and resources',
      },
    ],
    truncated: false,
    input_tokens: query.split(' ').length + 10, // Rough estimate
    output_tokens: aiResponse.split(' ').length + 5,
    available_quotas: {
      ClusterQuotaLimiter: 998911,
      UserQuotaLimiter: 998911,
    },
    tool_calls: [],
    tool_results: [],
  };

  // Store the conversation message
  const conversation = conversations.get(conversationId);
  conversation.messages.push({
    query,
    response: aiResponse,
    timestamp: new Date().toISOString(),
    user_id: user_id || null,
  });

  res.json(response);
});

// POST /v1/streaming_query - Streaming conversation request
app.post('/v1/streaming_query', async (req, res) => {
  const { query, conversation_id, media_type } = req.body;
  const { user_id } = req.query;

  // Validate required fields
  if (!query || typeof query !== 'string') {
    return res.status(422).json({
      detail: [
        {
          loc: ['body', 'query'],
          msg: 'Query is required and must be a string',
          type: 'value_error',
        },
      ],
    });
  }

  const conversationId = conversation_id || uuidv4();
  const aiResponse = generateAIResponse(query);
  const mediaType = media_type || 'text/plain';

  // Store conversation if not exists
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      id: conversationId,
      messages: [],
      created_at: new Date().toISOString(),
    });
  }

  if (mediaType === 'application/json') {
    // JSON SSE streaming
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const words = aiResponse.split(' ');

    // Send start event
    res.write(
      `data: ${JSON.stringify({
        event: 'start',
        data: { conversation_id: conversationId },
      })}\n\n`
    );

    // Send token events
    for (let i = 0; i < words.length; i++) {
      const token = words[i] + (i < words.length - 1 ? ' ' : '');

      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 150)
      );

      try {
        res.write(
          `data: ${JSON.stringify({
            event: 'token',
            data: { id: i, token },
          })}\n\n`
        );
      } catch (error) {
        console.error('Error writing JSON chunk:', error);
        break;
      }
    }

    // Send end event
    res.write(
      `data: ${JSON.stringify({
        event: 'end',
        data: {
          referenced_documents: [
            {
              doc_url:
                'https://docs.openshift.com/container-platform/4.15/welcome/index.html',
              doc_title: 'Red Hat OpenShift Container Platform Documentation',
            },
          ],
          truncated: false,
          input_tokens: query.split(' ').length + 10,
          output_tokens: aiResponse.split(' ').length + 5,
        },
        available_quotas: {
          ClusterQuotaLimiter: 998911,
          UserQuotaLimiter: 998911,
        },
      })}\n\n`
    );
  } else {
    // Plain text streaming (existing behavior)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chunks = createStreamingChunks(aiResponse);

    // Send chunks with realistic delays
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Add delay to simulate realistic streaming (50-200ms between chunks)
      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 150)
      );

      try {
        // Send as plain text - Lightspeed client accumulates all text chunks
        res.write(chunk.content);
      } catch (error) {
        console.error('Error writing chunk:', error);
        break;
      }
    }
  }

  // Store the complete conversation message when streaming ends
  const conversation = conversations.get(conversationId);
  conversation.messages.push({
    query,
    response: aiResponse,
    timestamp: new Date().toISOString(),
    user_id: user_id || null,
  });

  res.end();
});

// GET /v1/feedback/status - Feedback status
app.get('/v1/feedback/status', (req, res) => {
  res.json({
    functionality: 'feedback',
    status: {
      enabled: feedbackEnabled,
      storage_available: true,
      rate_limit: 100,
    },
  });
});

// PUT /v1/feedback/status - Update feedback status
app.put('/v1/feedback/status', (req, res) => {
  const { status } = req.body;

  if (typeof status !== 'boolean') {
    return res.status(422).json({
      detail: [
        {
          loc: ['body', 'status'],
          msg: 'Status must be a boolean value',
          type: 'type_error',
        },
      ],
    });
  }

  const previousStatus = feedbackEnabled;
  feedbackEnabled = status;

  res.json({
    status: {
      previous_status: previousStatus,
      updated_status: feedbackEnabled,
      updated_by: 'user/test',
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /v1/feedback - Store user feedback
app.post('/v1/feedback', (req, res) => {
  const {
    conversation_id,
    user_question,
    llm_response,
    sentiment,
    user_feedback,
    categories,
  } = req.body;

  // Validate required fields
  if (!conversation_id || !user_question || !llm_response) {
    return res.status(422).json({
      detail: [
        {
          loc: ['body'],
          msg: 'conversation_id, user_question, and llm_response are required',
          type: 'value_error',
        },
      ],
    });
  }

  const feedbackId = uuidv4();
  feedbackStorage.set(feedbackId, {
    id: feedbackId,
    conversation_id,
    user_question,
    llm_response,
    sentiment: sentiment || null,
    user_feedback: user_feedback || null,
    categories: categories || null,
    created_at: new Date().toISOString(),
  });

  res.json({
    response: 'feedback received',
  });
});

// GET /readiness - Readiness probe
app.get('/readiness', (_req, res) => {
  res.json({
    ready: true,
    reason: 'Service is ready',
    providers: [],
  });
});

// GET /liveness - Liveness probe
app.get('/liveness', (req, res) => {
  res.json({
    alive: true,
  });
});

// GET /metrics - Metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = `# HELP lightspeed_requests_total Total number of requests
# TYPE lightspeed_requests_total counter
lightspeed_requests_total{method="POST",endpoint="/v1/query"} ${Math.floor(
    Math.random() * 1000 + 100
  )}
lightspeed_requests_total{method="POST",endpoint="/v1/streaming_query"} ${Math.floor(
    Math.random() * 500 + 50
  )}

# HELP lightspeed_response_time_seconds Response time in seconds
# TYPE lightspeed_response_time_seconds histogram
lightspeed_response_time_seconds_bucket{le="0.1"} ${Math.floor(
    Math.random() * 100 + 10
  )}
lightspeed_response_time_seconds_bucket{le="0.5"} ${Math.floor(
    Math.random() * 200 + 50
  )}
lightspeed_response_time_seconds_bucket{le="1.0"} ${Math.floor(
    Math.random() * 300 + 100
  )}
lightspeed_response_time_seconds_bucket{le="+Inf"} ${Math.floor(
    Math.random() * 400 + 150
  )}

# HELP lightspeed_conversations_active Currently active conversations
# TYPE lightspeed_conversations_active gauge
lightspeed_conversations_active ${conversations.size}

# HELP lightspeed_feedback_total Total feedback submissions
# TYPE lightspeed_feedback_total counter
lightspeed_feedback_total ${feedbackStorage.size}`;

  res.setHeader('Content-Type', 'text/plain');
  res.send(metrics);
});

// POST /authorized - Check user authorization
app.post('/authorized', (req, res) => {
  const { user_id } = req.query;

  // Simulate authorization check
  const isAuthorized = true;

  if (isAuthorized) {
    res.json({
      user_id: user_id || userInfo.user_id,
      username: userInfo.username,
      skip_user_id_check: userInfo.skip_user_id_check,
    });
  } else {
    res.status(403).json({
      detail: 'User is not authorized',
    });
  }
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({
    detail: {
      cause: 'Internal server error',
      response: 'Unexpected error during request processing',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    detail: [
      {
        loc: ['path'],
        msg: 'Endpoint not found',
        type: 'not_found',
      },
    ],
  });
});

// Start server
const server = app.listen(port, () => {
  logServerStart('LightSpeed', port, [
    { method: 'GET', path: '/' },
    { method: 'GET', path: '/v1/info' },
    { method: 'GET', path: '/v1/models' },
    { method: 'GET', path: '/v1/config' },
    { method: 'POST', path: '/v1/query' },
    { method: 'POST', path: '/v1/streaming_query' },
    { method: 'GET', path: '/v1/conversations' },
    { method: 'GET', path: '/v1/conversations/:id' },
    { method: 'DELETE', path: '/v1/conversations/:id' },
    { method: 'GET', path: '/v1/feedback/status' },
    { method: 'PUT', path: '/v1/feedback/status' },
    { method: 'POST', path: '/v1/feedback' },
    { method: 'GET', path: '/readiness' },
    { method: 'GET', path: '/liveness' },
    { method: 'GET', path: '/metrics' },
    { method: 'POST', path: '/authorized' },
  ]);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logServerShutdown('LightSpeed');
  server.close(() => {
    console.log('✅ LightSpeed mock server stopped');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
