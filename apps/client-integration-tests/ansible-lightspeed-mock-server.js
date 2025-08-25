#!/usr/bin/env node

/**
 * Ansible Lightspeed Mock Server
 *
 * This mock server implements the Ansible Lightspeed API specification for testing the
 * @redhat-cloud-services/ansible-lightspeed package and its integration with
 * the state management system.
 *
 * Based on Ansible Lightspeed OpenAPI spec version 0.1.3
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { createMockLogger, logServerStart } = require('./shared/mock-logger');

const app = express();
const port = process.env.PORT || 3003;

const mockLogger = createMockLogger('Ansible-LS', port);

// Middleware
app.use(cors());
app.use(express.json());
app.use(mockLogger);

// In-memory storage for conversations and feedback
const conversations = new Map();
const feedbackStorage = new Map();
const userInfo = {
  user_id: uuidv4(),
  username: 'ansible-user',
};

// Helper function to generate realistic Ansible responses
function generateAnsibleResponse(input) {
  const responses = [
    `Based on your question about "${input}", here's how you can approach this with Ansible...`,
    `That's a great Ansible question about "${input}". Let me help you with that...`,
    `Regarding "${input}" in Ansible, here's what I recommend...`,
    `For "${input}" in Ansible playbooks, you can use the following approach...`,
  ];

  const baseResponse = responses[Math.floor(Math.random() * responses.length)];

  // Add some realistic Ansible-specific continuation
  const continuations = [
    ' You can use the ansible.builtin.copy module for this task.',
    ' Consider using ansible.builtin.template for dynamic configuration.',
    ' The ansible.builtin.service module will help you manage services.',
    ' Use ansible.builtin.package to manage software packages.',
  ];

  return (
    baseResponse +
    continuations[Math.floor(Math.random() * continuations.length)]
  );
}

// Helper function to simulate streaming response
function createStreamingResponse(res, query, conversationId) {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const response = generateAnsibleResponse(query);
  const tokens = response.split(' ');

  // Start event
  res.write(
    `data: ${JSON.stringify({
      event: 'start',
      data: { conversation_id: conversationId },
    })}\n\n`
  );

  let tokenId = 0;

  // Send tokens progressively
  tokens.forEach((token, index) => {
    setTimeout(() => {
      res.write(
        `data: ${JSON.stringify({
          event: 'token',
          data: {
            id: tokenId++,
            role: 'inference',
            token: index === 0 ? token : ` ${token}`,
          },
        })}\n\n`
      );

      // Send turn_complete after last token
      if (index === tokens.length - 1) {
        setTimeout(() => {
          res.write(
            `data: ${JSON.stringify({
              event: 'turn_complete',
              data: {
                id: tokenId++,
                token: response,
              },
            })}\n\n`
          );

          // Send end event
          setTimeout(() => {
            res.write(
              `data: ${JSON.stringify({
                event: 'end',
                data: {
                  referenced_documents: [],
                  truncated: null,
                  input_tokens: tokens.length,
                  output_tokens: tokens.length,
                },
                available_quotas: {},
              })}\n\n`
            );

            res.end();
          }, 100);
        }, 100);
      }
    }, index * 150); // 150ms delay between tokens
  });
}

// Root endpoint
app.get('/', (req, res) => {
  res.send(
    '<html><body><h1>Ansible Lightspeed Mock Server</h1><p>Running on port ' +
      port +
      '</p></body></html>'
  );
});

// Info endpoint
app.get('/v1/info', (req, res) => {
  res.json({
    name: 'Ansible Lightspeed Intelligent Assistant service',
    version: '0.1.3',
  });
});

// Models endpoint
app.get('/v1/models', (req, res) => {
  res.json({
    models: [
      {
        identifier: 'all-MiniLM-L6-v2',
        metadata: { embedding_dimension: 384 },
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
    ],
  });
});

// Query endpoint (non-streaming)
app.post('/v1/query', (req, res) => {
  const { query, conversation_id } = req.body;

  if (!query) {
    return res.status(422).json({
      detail: [
        {
          loc: ['body', 'query'],
          msg: 'field required',
          type: 'value_error.missing',
        },
      ],
    });
  }

  const responseConversationId = conversation_id || uuidv4();
  const response = generateAnsibleResponse(query);

  // Store conversation
  if (!conversations.has(responseConversationId)) {
    conversations.set(responseConversationId, []);
  }

  conversations
    .get(responseConversationId)
    .push(
      { content: query, type: 'user' },
      { content: response, type: 'assistant' }
    );

  res.json({
    conversation_id: responseConversationId,
    response: response,
  });
});

// Streaming query endpoint
app.post('/v1/streaming_query', (req, res) => {
  const { query, conversation_id } = req.body;

  if (!query) {
    return res.status(422).json({
      detail: [
        {
          loc: ['body', 'query'],
          msg: 'field required',
          type: 'value_error.missing',
        },
      ],
    });
  }

  const responseConversationId = conversation_id || uuidv4();

  // Store conversation
  if (!conversations.has(responseConversationId)) {
    conversations.set(responseConversationId, []);
  }

  const response = generateAnsibleResponse(query);
  conversations
    .get(responseConversationId)
    .push(
      { content: query, type: 'user' },
      { content: response, type: 'assistant' }
    );

  createStreamingResponse(res, query, responseConversationId);
});

// Feedback endpoint
app.post('/v1/feedback', (req, res) => {
  const {
    conversation_id,
    user_question,
    llm_response,
    sentiment,
    user_feedback,
    categories,
  } = req.body;

  if (!conversation_id || !user_question || !llm_response) {
    return res.status(422).json({
      detail: [
        { loc: ['body'], msg: 'Missing required fields', type: 'value_error' },
      ],
    });
  }

  const feedbackId = uuidv4();
  feedbackStorage.set(feedbackId, {
    id: feedbackId,
    conversation_id,
    user_question,
    llm_response,
    sentiment,
    user_feedback,
    categories,
    timestamp: new Date().toISOString(),
  });

  res.json({
    response: 'Feedback received and stored',
  });
});

// Feedback status endpoint
app.get('/v1/feedback/status', (req, res) => {
  res.json({
    functionality: 'feedback',
    status: { enabled: true },
  });
});

// Get conversation endpoint
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

  const chatHistory = conversations.get(conversation_id);
  res.json({
    conversation_id,
    chat_history: [
      {
        messages: chatHistory,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
    ],
  });
});

// Delete conversation endpoint
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
    conversation_id,
    success: true,
    response: 'Conversation deleted successfully',
  });
});

// Config endpoint
app.get('/v1/config', (req, res) => {
  res.json({
    name: 'Ansible Lightspeed Mock Config',
    service: {
      host: 'localhost',
      port: port,
      auth_enabled: false,
      workers: 1,
      color_log: true,
      access_log: true,
      tls_config: {
        tls_certificate_path: 'config/certificate.crt',
        tls_key_path: 'config/private.key',
      },
    },
    llama_stack: {
      url: 'http://localhost:8321',
      api_key: 'mock-key',
      use_as_library_client: false,
    },
    user_data_collection: {
      feedback_enabled: true,
      feedback_storage: '/tmp/data/feedback',
      transcripts_enabled: false,
    },
    mcp_servers: [],
  });
});

// Health endpoints
app.get('/readiness', (req, res) => {
  res.json({
    ready: true,
    reason: 'Service is ready',
    providers: [],
  });
});

app.get('/liveness', (req, res) => {
  res.json({
    alive: true,
  });
});

// Authorization endpoint
app.post('/authorized', (req, res) => {
  res.json(userInfo);
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`# HELP ansible_lightspeed_requests_total Total number of requests
# TYPE ansible_lightspeed_requests_total counter
ansible_lightspeed_requests_total{method="POST",endpoint="/v1/query"} 42
ansible_lightspeed_requests_total{method="POST",endpoint="/v1/streaming_query"} 13
`);
});

// Start server
app.listen(port, () => {
  logServerStart('Ansible LightSpeed', port, [
    { method: 'GET', path: '/v1/info' },
    { method: 'GET', path: '/v1/models' },
    { method: 'POST', path: '/v1/query' },
    { method: 'POST', path: '/v1/streaming_query' },
    { method: 'POST', path: '/v1/feedback' },
    { method: 'GET', path: '/v1/feedback/status' },
    { method: 'GET', path: '/v1/conversations/:id' },
    { method: 'DELETE', path: '/v1/conversations/:id' },
    { method: 'GET', path: '/v1/config' },
    { method: 'GET', path: '/readiness' },
    { method: 'GET', path: '/liveness' },
    { method: 'POST', path: '/authorized' },
    { method: 'GET', path: '/metrics' },
  ]);
});
