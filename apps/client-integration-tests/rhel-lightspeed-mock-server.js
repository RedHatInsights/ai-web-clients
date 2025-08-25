#!/usr/bin/env node

/**
 * RHEL LightSpeed Mock Server
 *
 * This mock server implements the RHEL LightSpeed API specification for testing the
 * @redhat-cloud-services/rhel-lightspeed-client package and its integration with
 * the state management system.
 *
 * Based on RHEL LightSpeed OpenAPI spec version 0.0.1
 * Uses RAG (Retrieval Augmented Generation) - no traditional conversation management
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
const port = process.env.PORT || 3005;

const mockLogger = createMockLogger('RHEL-LS', port);

// Middleware
app.use(cors());
app.use(express.json());
app.use(mockLogger);

// Helper function to generate realistic RAG responses based on context
function generateRAGResponse(question, context) {
  const responses = [
    `Based on your question about "${question}", here's what I found in the RHEL documentation...`,
    `That's a great RHEL question about "${question}". Let me provide you with information from the knowledge base...`,
    `Regarding "${question}", I've searched the RHEL documentation and found the following...`,
    `Thank you for asking about "${question}". Here's what the RHEL knowledge base says...`,
  ];

  const baseResponse = responses[Math.floor(Math.random() * responses.length)];

  // Add context-aware continuation based on provided context
  const continuations = [
    ' This is a common RHEL administration task that involves several key steps.',
    ' RHEL provides built-in tools and utilities to help you accomplish this.',
    ' The recommended approach in RHEL follows enterprise best practices.',
    ' This functionality is available in all supported RHEL versions.',
  ];

  // Add system-specific information if systeminfo is provided
  let systemSpecific = '';
  if (context?.systeminfo?.os) {
    systemSpecific = ` For your ${context.systeminfo.os} ${
      context.systeminfo.version || ''
    } system`;
    if (context.systeminfo.arch) {
      systemSpecific += ` running on ${context.systeminfo.arch} architecture`;
    }
    systemSpecific += ', ';
  }

  // Add terminal context if available
  let terminalContext = '';
  if (context?.terminal?.output) {
    terminalContext =
      ' Based on your terminal output, I can see the current state and provide more specific guidance.';
  }

  return (
    baseResponse +
    systemSpecific +
    continuations[Math.floor(Math.random() * continuations.length)] +
    terminalContext
  );
}

// Hello world endpoint - GET /
app.get('/api/lightspeed/v1/', (req, res) => {
  res.json({
    message: 'Hello from RHEL LightSpeed API',
    version: '0.0.1',
    description:
      'Answer questions using WatsonX and (optionally) RHEL RAG data',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint - GET /health
app.get('/api/lightspeed/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.0.1-mock',
    service: 'RHEL LightSpeed API',
  });
});

// Prometheus metrics endpoint - GET /metrics
app.get('/api/lightspeed/v1/metrics', (req, res) => {
  const metrics = {
    api_requests_total: Math.floor(Math.random() * 1000 + 100),
    rag_queries_total: Math.floor(Math.random() * 800 + 50),
    response_time_seconds: (Math.random() * 2 + 0.1).toFixed(3),
    active_connections: Math.floor(Math.random() * 50 + 10),
    cache_hit_ratio: (Math.random() * 0.3 + 0.7).toFixed(2), // 70-100% hit ratio
  };

  res.json(metrics);
});

// Main RAG inference endpoint - POST /infer
app.post('/api/lightspeed/v1/infer', (req, res) => {
  const { question, context } = req.body;

  // Validate required question field
  if (!question || typeof question !== 'string' || question.trim() === '') {
    return res.status(422).json({
      detail: [
        {
          loc: ['body', 'question'],
          msg: 'Question is required and must be a non-empty string',
          type: 'value_error',
        },
      ],
    });
  }

  // Check for error injection headers for testing
  const errorType = req.headers['x-mock-error-type'];
  const errorMessage =
    req.headers['x-mock-error-message'] || 'Simulated RAG error for testing';

  if (errorType === 'server_error') {
    return res.status(500).json({
      detail: [
        {
          loc: ['server'],
          msg: errorMessage,
          type: 'server_error',
        },
      ],
    });
  }

  if (errorType === 'validation_error') {
    return res.status(422).json({
      detail: [
        {
          loc: ['body', 'question'],
          msg: errorMessage,
          type: 'validation_error',
        },
      ],
    });
  }

  // Generate RAG response
  const messageId = uuidv4();
  const ragResponse = generateRAGResponse(question, context);

  // Add delay to simulate processing time
  setTimeout(() => {
    // Match real server response format
    res.json({
      data: {
        text: ragResponse,
        request_id: messageId,
      },
    });
  }, 100 + Math.random() * 300);
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
  logServerStart('RHEL LightSpeed', port, [
    { method: 'GET', path: '/api/lightspeed/v1/' },
    { method: 'GET', path: '/api/lightspeed/v1/health' },
    { method: 'GET', path: '/api/lightspeed/v1/metrics' },
    { method: 'POST', path: '/api/lightspeed/v1/infer' },
  ]);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logServerShutdown('RHEL LightSpeed');
  server.close(() => {
    console.log('✅ RHEL LightSpeed mock server stopped');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
