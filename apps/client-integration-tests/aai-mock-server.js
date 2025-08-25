#!/usr/bin/env node

/**
 * AAI (Ansible Assisted Installer) Mock Server
 *
 * This mock server implements the AAI API specification for testing the
 * @redhat-cloud-services/aai-client package and its integration with
 * the state management system.
 *
 * Implements Server-Sent Events streaming endpoint and status endpoint.
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
const port = process.env.PORT || 3004;

const mockLogger = createMockLogger('AAI', port);

// Middleware
app.use(cors());
app.use(express.json());
app.use(mockLogger);

// In-memory storage for conversations (session-based)
const conversationSessions = new Map();

// Helper function to generate realistic AI responses
function generateAIResponse(query) {
  const responses = [
    `Based on your question about "${query}", here's what I can help you with regarding Ansible Automation Platform...`,
    `That's a great question about "${query}". Let me provide you with some information about using Ansible...`,
    `Regarding "${query}", I'd be happy to explain this Ansible concept...`,
    `Thank you for asking about "${query}". Here's a comprehensive answer about Ansible automation...`,
  ];

  const baseResponse = responses[Math.floor(Math.random() * responses.length)];

  // Add some realistic Ansible-specific continuation
  const continuations = [
    ' Ansible Automation Platform (AAP) is a commercial offering from Red Hat that enhances Ansible-powered environments by providing control, knowledge, and delegation capabilities for managing complex multi-tier deployments.',
    ' This involves several key concepts including playbooks, execution environments, and automation mesh that are important to understand for effective implementation.',
    ' Let me break this down into the most important aspects you should know about automation with Ansible.',
    ' There are several approaches you can take, depending on your specific infrastructure requirements and automation goals.',
  ];

  return (
    baseResponse +
    continuations[Math.floor(Math.random() * continuations.length)]
  );
}

// Helper function to create Server-Sent Events stream
function createSSEEvents(fullResponse, conversationId, options = {}) {
  const words = fullResponse.split(' ');
  const events = [];

  // Start event
  events.push({
    event: 'start',
    data: {
      conversation_id: conversationId,
    },
  });
  for (let i = 0; i < words.length; i++) {
    // Create token events every word for predictable testing (no randomness)
    events.push({
      event: 'token',
      data: {
        id: i,
        role: 'inference',
        token: i === 0 ? words[i] : ' ' + words[i],
      },
    });
  }

  // Add tool call events if requested via header
  if (options.includeToolCalls) {
    events.push({
      event: 'tool_call',
      data: {
        id: words.length + 1,
        role: 'tool_execution',
        token:
          "Tool:knowledge_search arguments:{'query': 'ansible automation platform'}",
      },
    });

    events.push({
      event: 'tool_call',
      data: {
        id: words.length + 2,
        role: 'tool_execution',
        token:
          'Tool:knowledge_search summary:knowledge_search tool found 3 chunks',
      },
    });
  }

  // Turn complete event with full response
  events.push({
    event: 'turn_complete',
    data: {
      id: words.length + (options.includeToolCalls ? 3 : 1),
      token: fullResponse,
    },
  });

  // End event with metadata
  const endEvent = {
    event: 'end',
    data: {
      referenced_documents: [
        {
          doc_url:
            'https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/',
          doc_title: 'Red Hat Ansible Automation Platform Documentation',
        },
        {
          doc_url: 'https://ansible.readthedocs.io/',
          doc_title: 'Ansible Community Documentation',
        },
      ],
      truncated: null,
      input_tokens: words.length,
      output_tokens: words.length * 2,
      available_quotas: {},
    },
  };

  // Add custom metadata if requested via headers
  if (options.includeExtraMetadata) {
    endEvent.data.custom_metadata = {
      test_flag: true,
      processing_time: '250ms',
    };
  }

  events.push(endEvent);

  return events;
}

// Health/Status endpoint
app.get('/api/v1/health/status/chatbot/', (req, res) => {
  // Check for error injection headers
  const triggerError = req.headers['x-mock-server-error'] === 'true';

  if (triggerError) {
    return res.status(500).json({
      error: 'Simulated server error for testing',
    });
  }

  res.json({
    'chatbot-service': 'ok',
    'streaming-chatbot-service': 'ok',
  });
});

// Streaming chat endpoint
app.post('/api/v1/ai/streaming_chat/', async (req, res) => {
  const { model, provider, query, conversation_id } = req.body;

  // Check for control headers
  const errorAfterChunks = req.headers['x-mock-error-after-chunks'];
  const errorMessage =
    req.headers['x-mock-error-message'] ||
    'Simulated streaming error for testing';
  const includeToolCalls = req.headers['x-mock-include-tool-calls'] === 'true';
  const includeExtraMetadata =
    req.headers['x-mock-include-extra-metadata'] === 'true';

  // Validate required fields
  if (!model || !provider || !query) {
    return res.status(422).json({
      detail: [
        {
          loc: ['body'],
          msg: 'model, provider, and query are required',
          type: 'value_error',
        },
      ],
    });
  }

  // Handle conversation ID: use provided one or generate new one
  let conversationId;
  if (conversation_id) {
    // Use existing conversation ID from request
    conversationId = conversation_id;
  } else {
    // No conversation ID provided - create a new conversation
    // This simulates the server creating a new conversation for the first message
    conversationId = uuidv4();
  }

  // Store conversation in session for potential future use
  const sessionId = req.headers['x-session-id'] || 'default-session';
  conversationSessions.set(sessionId, conversationId);

  const aiResponse = generateAIResponse(query);
  const events = createSSEEvents(aiResponse, conversationId, {
    includeToolCalls,
    includeExtraMetadata,
  });
  const shouldErrorAfterChunks = errorAfterChunks
    ? parseInt(errorAfterChunks, 10)
    : null;

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send SSE events with realistic delays
  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Add small predictable delay to simulate streaming
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check if we should inject an error after a specific number of events
    if (shouldErrorAfterChunks !== null && i >= shouldErrorAfterChunks) {
      // Send error in SSE format
      const errorEvent = {
        event: 'error',
        data: {
          error: errorMessage,
          status: 500,
        },
      };

      try {
        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
      } catch (error) {
        console.error('Error writing error event:', error);
      }

      res.end();
      return;
    }

    try {
      // Write in Server-Sent Events format
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      console.error('Error writing event:', error);
      break;
    }

    // End stream after 'end' event
    if (event.event === 'end') {
      res.end();
      return;
    }
  }
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({
    detail: [
      {
        loc: ['server'],
        msg: 'Internal server error',
        type: 'server_error',
      },
    ],
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
  logServerStart('AAI', port, [
    { method: 'GET', path: '/api/v1/health/status/chatbot/' },
    { method: 'POST', path: '/api/v1/ai/streaming_chat/' },
  ]);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logServerShutdown('AAI');
  server.close(() => {
    console.log('✅ AAI mock server stopped');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
