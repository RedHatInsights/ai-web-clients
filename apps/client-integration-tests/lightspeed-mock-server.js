#!/usr/bin/env node

/**
 * Lightspeed Mock Server
 * 
 * This mock server implements the Lightspeed API specification for testing the
 * @redhat-cloud-services/lightspeed-client package and its integration with
 * the state management system.
 * 
 * Based on Lightspeed OpenAPI spec version 1.0.1
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3002;

const expressLogger = (req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(expressLogger);

// In-memory storage for conversations and feedback
const conversations = new Map();
const feedbackStorage = new Map();
const userInfo = {
  user_id: uuidv4(),
  username: 'testuser',
  skip_user_id_check: false
};

// Helper function to generate realistic AI responses
function generateAIResponse(input) {
  const responses = [
    `Based on your question about "${input}", here's what I can help you with regarding OpenShift...`,
    `That's a great question about "${input}". Let me provide you with some information about OpenShift...`,
    `Regarding "${input}" in OpenShift, I'd be happy to explain this topic...`,
    `Thank you for asking about "${input}". Here's a comprehensive answer about OpenShift...`
  ];
  
  const baseResponse = responses[Math.floor(Math.random() * responses.length)];
  
  // Add some realistic OpenShift-specific continuation
  const continuations = [
    ' OpenShift is a comprehensive container platform built on Kubernetes that provides developers and IT operations teams with a complete solution for building, deploying, and managing applications.',
    ' This involves several key OpenShift concepts that are important to understand for effective implementation in your cluster environment.',
    ' Let me break this down into the most important OpenShift aspects you should know for your container workloads.',
    ' There are several approaches you can take in OpenShift, depending on your specific requirements and cluster configuration.'
  ];
  
  return baseResponse + continuations[Math.floor(Math.random() * continuations.length)];
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
      finished: i === words.length - 1
    });
  }
  
  return chunks;
}

// POST /v1/query - Non-streaming conversation request
app.post('/v1/query', (req, res) => {
  const { query, conversation_id } = req.body;
  const { user_id } = req.query;
  
  // Validate required fields
  if (!query || typeof query !== 'string') {
    return res.status(422).json({
      detail: [{
        loc: ['body', 'query'],
        msg: 'Query is required and must be a string',
        type: 'value_error'
      }]
    });
  }
  
  const conversationId = conversation_id || uuidv4();
  const aiResponse = generateAIResponse(query);
  
  // Store conversation if not exists
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      id: conversationId,
      messages: [],
      created_at: new Date().toISOString()
    });
  }
  
  const response = {
    conversation_id: conversationId,
    response: aiResponse,
    referenced_documents: [
      {
        doc_url: 'https://docs.openshift.com/container-platform/4.15/welcome/index.html',
        doc_title: 'Red Hat OpenShift Container Platform Documentation'
      },
      {
        doc_url: 'https://docs.openshift.com/container-platform/4.15/operators/understanding/olm/olm-understanding-olm.html',
        doc_title: 'Operator Lifecycle Manager concepts and resources'
      }
    ],
    truncated: false,
    input_tokens: query.split(' ').length + 10, // Rough estimate
    output_tokens: aiResponse.split(' ').length + 5,
    available_quotas: {
      ClusterQuotaLimiter: 998911,
      UserQuotaLimiter: 998911
    },
    tool_calls: [],
    tool_results: []
  };
  
  // Store the conversation message
  const conversation = conversations.get(conversationId);
  conversation.messages.push({
    query,
    response: aiResponse,
    timestamp: new Date().toISOString(),
    user_id: user_id || null
  });
  
  res.json(response);
});

// POST /v1/streaming_query - Streaming conversation request
app.post('/v1/streaming_query', async (req, res) => {
  const { query, conversation_id } = req.body;
  const { user_id } = req.query;
  
  // Validate required fields
  if (!query || typeof query !== 'string') {
    return res.status(422).json({
      detail: [{
        loc: ['body', 'query'],
        msg: 'Query is required and must be a string',
        type: 'value_error'
      }]
    });
  }
  
  const conversationId = conversation_id || uuidv4();
  const aiResponse = generateAIResponse(query);
  
  // Store conversation if not exists
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      id: conversationId,
      messages: [],
      created_at: new Date().toISOString()
    });
  }
  
  // Set headers for plain text streaming (Lightspeed client expects plain text)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const chunks = createStreamingChunks(aiResponse);
  
  // Send chunks with realistic delays
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Add delay to simulate realistic streaming (50-200ms between chunks)
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
    
    try {
      // Send as plain text - Lightspeed client accumulates all text chunks
      res.write(chunk.content);
    } catch (error) {
      console.error('Error writing chunk:', error);
      break;
    }
    
    // Store the complete conversation message when streaming ends
    if (chunk.finished) {
      const conversation = conversations.get(conversationId);
      conversation.messages.push({
        query,
        response: aiResponse,
        timestamp: new Date().toISOString(),
        user_id: user_id || null
      });
    }
  }
  
  res.end();
});

// GET /v1/feedback/status - Feedback status
app.get('/v1/feedback/status', (req, res) => {
  res.json({
    functionality: 'feedback',
    status: {
      enabled: true,
      storage_available: true,
      rate_limit: 100
    }
  });
});

// POST /v1/feedback - Store user feedback
app.post('/v1/feedback', (req, res) => {
  const { conversation_id, user_question, llm_response, sentiment, user_feedback } = req.body;
  
  // Validate required fields
  if (!conversation_id || !user_question || !llm_response) {
    return res.status(422).json({
      detail: [{
        loc: ['body'],
        msg: 'conversation_id, user_question, and llm_response are required',
        type: 'value_error'
      }]
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
    created_at: new Date().toISOString()
  });
  
  res.json({
    response: 'feedback received'
  });
});

// GET /readiness - Readiness probe
app.get('/readiness', (req, res) => {
  // Simulate occasional not-ready state for testing
  const isReady = Math.random() > 0.1; // 90% ready
  
  if (isReady) {
    res.json({
      ready: true,
      reason: 'service is ready'
    });
  } else {
    res.status(503).json({
      detail: {
        cause: 'Index is not ready',
        response: 'Service is not ready'
      }
    });
  }
});

// GET /liveness - Liveness probe
app.get('/liveness', (req, res) => {
  res.json({
    alive: true
  });
});

// GET /metrics - Metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = `# HELP lightspeed_requests_total Total number of requests
# TYPE lightspeed_requests_total counter
lightspeed_requests_total{method="POST",endpoint="/v1/query"} ${Math.floor(Math.random() * 1000 + 100)}
lightspeed_requests_total{method="POST",endpoint="/v1/streaming_query"} ${Math.floor(Math.random() * 500 + 50)}

# HELP lightspeed_response_time_seconds Response time in seconds
# TYPE lightspeed_response_time_seconds histogram
lightspeed_response_time_seconds_bucket{le="0.1"} ${Math.floor(Math.random() * 100 + 10)}
lightspeed_response_time_seconds_bucket{le="0.5"} ${Math.floor(Math.random() * 200 + 50)}
lightspeed_response_time_seconds_bucket{le="1.0"} ${Math.floor(Math.random() * 300 + 100)}
lightspeed_response_time_seconds_bucket{le="+Inf"} ${Math.floor(Math.random() * 400 + 150)}

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
  const isAuthorized = true
  
  if (isAuthorized) {
    res.json({
      user_id: user_id || userInfo.user_id,
      username: userInfo.username,
      skip_user_id_check: userInfo.skip_user_id_check
    });
  } else {
    res.status(403).json({
      detail: 'User is not authorized'
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
      response: 'Unexpected error during request processing'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    detail: [{
      loc: ['path'],
      msg: 'Endpoint not found',
      type: 'not_found'
    }]
  });
});

// Start server
const server = app.listen(port, () => {
  console.log(`Lightspeed Mock Server running on http://localhost:${port}`);
  console.log(`Lightspeed API endpoints:`);
  console.log(`   POST /v1/query`);
  console.log(`   POST /v1/streaming_query`);
  console.log(`   GET  /v1/feedback/status`);
  console.log(`   POST /v1/feedback`);
  console.log(`   GET  /readiness`);
  console.log(`   GET  /liveness`);
  console.log(`   GET  /metrics`);
  console.log(`   POST /authorized`);
  console.log(`\nBased on OpenShift Lightspeed service API specification v1.0.1`);
  console.log(`Compatible with @redhat-cloud-services/lightspeed-client`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Lightspeed mock server...');
  server.close(() => {
    console.log('Lightspeed mock server stopped');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app; 