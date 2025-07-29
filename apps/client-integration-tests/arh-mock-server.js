#!/usr/bin/env node

/**
 * ARH (Intelligent Front Door) Mock Server
 * 
 * This mock server implements the ARH API specification for testing the
 * @redhat-cloud-services/arh-client package and its integration with
 * the state management system.
 * 
 * Based on ARH OpenAPI spec version 0.4.9
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

const expressLogger = (req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(expressLogger);

// In-memory storage for conversations and messages
const conversations = new Map();
// conversations.set('oldest-conversation', {
//   id: 'oldest-conversation',
//   title: 'Oldest Conversation',
//   messages: [
//     {
//       message_id: 'message-1',
//       received_at: '2023-10-01T12:00:00Z',
//       input: 'What is Red Hat OpenShift?',
//       created_at: '2023-10-01T12:00:00Z',
//       answer: 'Red Hat OpenShift is a comprehensive container platform that provides developers and IT operations teams with a complete solution for building, deploying, and managing applications.',
//       sources: [{
//         title: 'Red Hat Documentation',
//         link: 'https://docs.redhat.com',
//         score: 0.95,
//         snippet: 'Official Red Hat documentation and knowledge base'
//       }]
//     }
//   ]
// });
const userSettings = {
  id: uuidv4(),
  preferences: {
    language: 'en',
    theme: 'light'
  }
};

// Helper function to generate realistic AI responses
function generateAIResponse(input) {
  const responses = [
    `Based on your question about "${input}", here's what I can help you with...`,
    `That's a great question about "${input}". Let me provide you with some information...`,
    `Regarding "${input}", I'd be happy to explain this topic...`,
    `Thank you for asking about "${input}". Here's a comprehensive answer...`
  ];
  
  const baseResponse = responses[Math.floor(Math.random() * responses.length)];
  
  // Add some realistic continuation
  const continuations = [
    ' Red Hat OpenShift is a comprehensive container platform that provides developers and IT operations teams with a complete solution for building, deploying, and managing applications.',
    ' This involves several key concepts that are important to understand for effective implementation.',
    ' Let me break this down into the most important aspects you should know.',
    ' There are several approaches you can take, depending on your specific requirements and environment.'
  ];
  
  return baseResponse + continuations[Math.floor(Math.random() * continuations.length)];
}

// Helper function to create streaming chunks
function createStreamingChunks(fullResponse, messageId, conversationId) {
  const words = fullResponse.split(' ');
  const chunks = [];
  let currentChunk = '';
  
  for (let i = 0; i < words.length; i++) {
    currentChunk += (i > 0 ? ' ' : '') + words[i];
    
    // Create chunk every 3-5 words or at the end
    if (i > 0 && (i % Math.floor(Math.random() * 3 + 3) === 0 || i === words.length - 1)) {
      chunks.push({
        message_id: messageId,
        conversation_id: conversationId,
        answer: currentChunk,
        received_at: new Date().toISOString(),
        sources: i === words.length - 1 ? [{
          title: 'Red Hat Documentation',
          link: 'https://docs.redhat.com',
          score: 0.95,
          snippet: 'Official Red Hat documentation and knowledge base'
        }] : [],
        tool_call_metadata: { tool_call: false },
        output_guard_result: { answer_relevance: 0.95 },
        end_of_stream: i === words.length - 1,
        type: 'inference'
      });
    }
  }
  
  return chunks;
}

// Create new conversation
app.post('/api/ask/v1/conversation', (req, res) => {
  const conversationId = uuidv4();
  
  // Mark all existing conversations as not latest
  for (const conversation of conversations.values()) {
    conversation.is_latest = false;
  }
  
  // Create new conversation and mark it as latest
  conversations.set(conversationId, {
    id: conversationId,
    messages: [],
    created_at: new Date().toISOString(),
    is_latest: true
  });
  
  res.json({
    conversation_id: conversationId,
    quota: {
      limit: 10,
      used: conversations.size,
      timeframe: 24
    }
  });
});

// Send message to conversation (supports both streaming and non-streaming)
app.post('/api/ask/v1/conversation/:conversationId/message', async (req, res) => {
  const { conversationId } = req.params;
  const { input, received_at = new Date().toISOString(), stream = false } = req.body;
  
  // Check for error injection headers
  const errorAfterChunks = req.headers['x-mock-error-after-chunks'];
  const errorType = req.headers['x-mock-error-type'] || 'stream_error';
  const errorMessage = req.headers['x-mock-error-message'] || 'Simulated streaming error for testing';
  
  // Validate conversation exists
  if (!conversations.has(conversationId)) {
    return res.status(404).json({
      detail: [{
        loc: ['path', 'conversation_id'],
        msg: 'Conversation not found',
        type: 'value_error'
      }]
    });
  }
  
  // Validate input
  if (!input || typeof input !== 'string') {
    return res.status(422).json({
      detail: [{
        loc: ['body', 'input'],
        msg: 'Input is required and must be a string',
        type: 'value_error'
      }]
    });
  }
  
  const conversation = conversations.get(conversationId);
  const messageId = uuidv4();
  const aiResponse = generateAIResponse(input);
  const messageTimestamp = new Date().toISOString();
  
  if (stream) {
    // Set headers for streaming response
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const chunks = createStreamingChunks(aiResponse, messageId, conversationId);
    const shouldErrorAfterChunks = errorAfterChunks ? parseInt(errorAfterChunks, 10) : null;
    
    // Send chunks with realistic delays
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Add delay to simulate realistic streaming
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 400));
      
      // Check if we should inject an error after a specific number of chunks
      if (shouldErrorAfterChunks !== null && i >= shouldErrorAfterChunks) {
        // Send error chunk in the format expected by the ARH client
        const errorChunk = {
          status_code: 500,
          detail: errorMessage,
          message_id: messageId,
          conversation_id: conversationId,
          type: errorType
        };
        
        try {
          res.write(JSON.stringify(errorChunk) + '\n');
        } catch (error) {
          console.error('Error writing error chunk:', error);
        }
        
        res.end();
        return;
      }
      
      try {
        res.write(JSON.stringify(chunk) + '\n');
      } catch (error) {
        console.error('Error writing chunk:', error);
        break;
      }
      
      // Store the complete conversation message when streaming ends
      if (chunk.end_of_stream) {
        conversation.messages.push({
          message_id: messageId,
          received_at,
          input,
          created_at: messageTimestamp,
          answer: chunk.answer,
          sources: chunk.sources
        });
      }
    }
    
    res.end();
  } else {
    // Non-streaming response
    const sources = [{
      title: 'Red Hat Documentation',
      link: 'https://docs.redhat.com',
      score: 0.95,
      snippet: 'Official Red Hat documentation and knowledge base'
    }];
    
    const response = {
      message_id: messageId,
      conversation_id: conversationId,
      answer: aiResponse,
      received_at: messageTimestamp,
      sources,
      tool_call_metadata: { tool_call: false },
      output_guard_result: { answer_relevance: 0.95 },
      end_of_stream: true,
      type: 'inference'
    };
    
    // Store complete conversation message
    conversation.messages.push({
      message_id: messageId,
      received_at,
      input,
      created_at: messageTimestamp,
      answer: aiResponse,
      sources
    });
    
    res.json(response);
  }
});

// Get conversation history
app.get('/api/ask/v1/conversation/:conversationId/history', (req, res) => {
  const { conversationId } = req.params;
  
  if (!conversations.has(conversationId)) {
    return res.status(404).json({
      detail: [{
        loc: ['path', 'conversation_id'],
        msg: 'Conversation not found',
        type: 'value_error'
      }]
    });
  }
  
  const conversation = conversations.get(conversationId);
  res.json(conversation.messages);
});

// Message feedback
app.post('/api/ask/v1/conversation/:conversationId/message/:messageId/feedback', (req, res) => {
  const { rating, freeform } = req.body;
  
  // Validate inputs
  if (!['positive', 'negative'].includes(rating)) {
    return res.status(422).json({
      detail: [{
        loc: ['body', 'rating'],
        msg: 'Rating must be either "positive" or "negative"',
        type: 'value_error'
      }]
    });
  }
  
  // In a real implementation, you'd store the feedback
  res.json({
    message: 'Feedback recorded successfully',
    feedback_id: uuidv4(),
    rating,
    freeform: freeform || null
  });
});

// Health check
app.get('/api/ask/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.4.9-mock'
  });
});

// Service status
app.get('/api/ask/v1/status', (req, res) => {
  res.json({
    api: {
      status: 'operational',
      response_time: Math.floor(Math.random() * 50 + 10) + 'ms'
    },
    database: {
      status: 'operational',
      connections: Math.floor(Math.random() * 100 + 50)
    },
    ai_service: {
      status: 'operational',
      model_version: 'mock-v1.0'
    }
  });
});

// Get user settings
app.get('/api/ask/v1/user/current', (req, res) => {
  res.json(userSettings);
});

// Update user settings
app.put('/api/ask/v1/user/current', (req, res) => {
  const updates = req.body;
  
  // Merge updates with existing settings
  Object.assign(userSettings, updates);
  
  res.json(userSettings);
});

// Get user history
app.get('/api/ask/v1/user/current/history', (req, res) => {
  const { limit = 10 } = req.query;
  
  // Convert conversations to history format matching OpenAPI spec
  const history = Array.from(conversations.values())
    .slice(0, parseInt(limit))
    .map(conv => ({
      conversation_id: conv.id,
      title: conv.messages.length > 0 ? conv.messages[0].input : 'New Conversation',
      created_at: conv.created_at,
      is_latest: conv.is_latest || false
    }));
  
  res.json(history);
});

// Get conversations quota
app.get('/api/ask/v1/quota/conversations', (req, res) => {
  res.json({
    limit: 10,
    used: conversations.size,
    timeframe: 24
  });
});

// Get message quota for conversation
app.get('/api/ask/v1/quota/:conversationId/messages', (req, res) => {
  const { conversationId } = req.params;
  
  if (!conversations.has(conversationId)) {
    return res.status(404).json({
      detail: [{
        loc: ['path', 'conversation_id'],
        msg: 'Conversation not found',
        type: 'value_error'
      }]
    });
  }
  
  const conversation = conversations.get(conversationId);
  const messageCount = conversation.messages.filter(msg => msg.answer).length; // Only count AI responses
  
  res.json({
    limit: 50,
    used: messageCount,
    timeframe: 24
  });
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({
    detail: [{
      loc: ['server'],
      msg: 'Internal server error',
      type: 'server_error'
    }]
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
  console.log(`🚀 ARH (Intelligent Front Door) Mock Server running on http://localhost:${port}`);
  console.log(`📋 ARH API endpoints:`);
  console.log(`   POST /api/ask/v1/conversation`);
  console.log(`   POST /api/ask/v1/conversation/:id/message`);
  console.log(`   GET  /api/ask/v1/conversation/:id/history`);
  console.log(`   POST /api/ask/v1/conversation/:id/message/:messageId/feedback`);
  console.log(`   GET  /api/ask/v1/health`);
  console.log(`   GET  /api/ask/v1/status`);
  console.log(`   GET  /api/ask/v1/user/current`);
  console.log(`   PUT  /api/ask/v1/user/current`);
  console.log(`   GET  /api/ask/v1/user/current/history`);
  console.log(`   GET  /api/ask/v1/quota/conversations`);
  console.log(`   GET  /api/ask/v1/quota/:conversationId/messages`);
  console.log(`\n💡 Use stream=true in message requests for streaming responses`);
  console.log(`📚 This mock server implements the ARH (Intelligent Front Door) API specification`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down ARH mock server...');
  server.close(() => {
    console.log('✅ ARH mock server stopped');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app; 