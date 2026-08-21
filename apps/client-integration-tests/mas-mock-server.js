#!/usr/bin/env node

/**
 * MAS (Multi-Agent System) Mock Server
 *
 * This mock server implements the MAS session API for testing the
 * @redhat-cloud-services/mas-client package and its integration with
 * the state management system.
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
const port = process.env.PORT || 3006;

const mockLogger = createMockLogger('MAS', port);

// Middleware
app.use(cors());
app.use(express.json());
app.use(mockLogger);

// In-memory storage
const sessions = new Map();
const blueprints = new Map([
  [
    'default-blueprint',
    { id: 'default-blueprint', name: 'Default Agent Workflow' },
  ],
  [
    'test-blueprint-123',
    { id: 'test-blueprint-123', name: 'Test Agent Workflow' },
  ],
]);

// Helper function to generate realistic AI responses
function generateAIResponse(input) {
  const responses = [
    `Based on your question about "${input}", here's what I found...`,
    `Let me help you with "${input}". Here's the information...`,
    `Regarding "${input}", I can provide the following insights...`,
    `Great question about "${input}". Here's a comprehensive answer...`,
  ];

  const baseResponse = responses[Math.floor(Math.random() * responses.length)];

  const continuations = [
    ' This multi-agent system processes your request through several specialized agents to provide accurate and comprehensive results.',
    ' The workflow analyzes your input, retrieves relevant information, and synthesizes a response using multiple AI agents.',
    ' Our agents collaborate to break down your question, research the topic, and formulate a detailed answer.',
    ' The system leverages multiple specialized tools and knowledge sources to deliver the best possible response.',
  ];

  return (
    baseResponse +
    continuations[Math.floor(Math.random() * continuations.length)]
  );
}

// --- Health Endpoints ---

app.get('/api/health/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is healthy',
  });
});

app.get('/api/health/version', (req, res) => {
  res.json({ version: '1.0.0-mock' });
});

// --- Session Endpoints ---

// Create session
app.post('/api/sessions/user.session.create', (req, res) => {
  const { blueprintId, metadata, hitlEnabled } = req.body;

  if (!blueprintId) {
    return res.status(422).json({
      error: 'blueprintId is required',
    });
  }

  if (!blueprints.has(blueprintId)) {
    return res.status(404).json({
      error: 'Blueprint not found',
      error_type: 'BLUEPRINT_NOT_FOUND',
      blueprint_id: blueprintId,
    });
  }

  const sessionId = uuidv4();

  sessions.set(sessionId, {
    session_id: sessionId,
    blueprint_id: blueprintId,
    started_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
    status: 'PENDING',
    messages: [],
    output: '',
    metadata: metadata || {},
    hitl_enabled: hitlEnabled || false,
    blueprint_exists: true,
  });

  // Return session ID as a JSON string (matches real API)
  res.json(sessionId);
});

// Submit message
app.post('/api/sessions/user.session.submit', (req, res) => {
  const { sessionId, inputs, scope } = req.body;

  if (!sessionId) {
    return res.status(422).json({ error: 'sessionId is required' });
  }

  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);

  if (['RUNNING', 'QUEUED'].includes(session.status)) {
    return res.status(409).json({ error: 'Session is already running' });
  }

  const userPrompt = inputs?.user_prompt || '';

  // Add user message
  session.messages.push({
    role: 'user',
    content: userPrompt,
    sender_id: 'user',
  });

  // Generate AI response and add it
  const aiResponse = generateAIResponse(userPrompt);
  session.messages.push({
    role: 'assistant',
    content: aiResponse,
    sender_id: 'agent',
  });

  session.output = aiResponse;
  session.status = 'COMPLETED';
  session.last_active_at = new Date().toISOString();

  const workflowId = `wf-${uuidv4().slice(0, 8)}`;

  res.status(202).json({
    sessionId,
    workflowId,
  });
});

// Subscribe to stream (NDJSON)
app.get('/api/sessions/session.subscribe', async (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);

  // Set NDJSON headers
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Get the last assistant message as our response to stream
  const lastAssistantMsg = [...session.messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  const fullResponse = lastAssistantMsg?.content || session.output || '';

  if (!fullResponse) {
    // No response yet, send heartbeat and end
    res.write(JSON.stringify({ type: 'heartbeat' }) + '\n');
    res.write(JSON.stringify({ type: 'stream_end' }) + '\n');
    res.end();
    return;
  }

  // Simulate streaming with llm_token events
  const words = fullResponse.split(' ');
  let accumulated = '';

  // Send initial heartbeat
  res.write(JSON.stringify({ type: 'heartbeat' }) + '\n');

  for (let i = 0; i < words.length; i++) {
    const chunk = (i > 0 ? ' ' : '') + words[i];
    accumulated += chunk;

    await new Promise((resolve) =>
      setTimeout(resolve, 30 + Math.random() * 70)
    );

    try {
      res.write(
        JSON.stringify({
          type: 'llm_token',
          node: 'agent-node',
          display_name: 'AI Agent',
          chunk: chunk,
        }) + '\n'
      );
    } catch (error) {
      break;
    }
  }

  // Send complete event
  await new Promise((resolve) => setTimeout(resolve, 100));
  res.write(
    JSON.stringify({
      type: 'complete',
      node: 'agent-node',
      display_name: 'AI Agent',
      state: {
        output: fullResponse,
        messages: session.messages,
      },
    }) + '\n'
  );

  // Send stream_end
  res.write(JSON.stringify({ type: 'stream_end' }) + '\n');
  res.end();
});

// Get chat state
app.get('/api/sessions/session.chat.get', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);

  res.json({
    messages: session.messages,
    output: session.output,
    status: session.status,
    status_message: null,
  });
});

// List user sessions
app.get('/api/sessions/session.user.list', (req, res) => {
  const sessionList = Array.from(sessions.values()).map((session) => ({
    session_id: session.session_id,
    metadata: session.metadata,
    started_at: session.started_at,
    last_active_at: session.last_active_at,
    blueprint_id: session.blueprint_id,
    blueprint_exists: session.blueprint_exists,
  }));

  res.json(sessionList);
});

// Delete session
app.delete('/api/sessions/session.delete', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  sessions.delete(sessionId);
  res.json({ success: true });
});

// Cancel session
app.post('/api/sessions/session.cancel', (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);

  if (!['QUEUED', 'RUNNING'].includes(session.status)) {
    return res.status(409).json({ error: 'Session is not cancellable' });
  }

  session.status = 'CANCELLED';

  res.json({ sessionId, status: 'CANCELLED' });
});

// Stream status
app.get('/api/sessions/session.stream.status', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);

  res.json({
    session_id: sessionId,
    event_count: session.messages.length * 10,
    last_event_id: `evt-${Date.now()}`,
    is_active: session.status === 'RUNNING',
  });
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(port, () => {
  logServerStart('MAS', port, [
    { method: 'GET', path: '/api/health/' },
    { method: 'POST', path: '/api/sessions/user.session.create' },
    { method: 'POST', path: '/api/sessions/user.session.submit' },
    { method: 'GET', path: '/api/sessions/session.subscribe' },
    { method: 'GET', path: '/api/sessions/session.chat.get' },
    { method: 'GET', path: '/api/sessions/session.user.list' },
    { method: 'DELETE', path: '/api/sessions/session.delete' },
    { method: 'POST', path: '/api/sessions/session.cancel' },
    { method: 'GET', path: '/api/sessions/session.stream.status' },
  ]);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logServerShutdown('MAS');
  server.close(() => {
    console.log('✅ MAS mock server stopped');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
