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

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for conversations and messages
const conversations = new Map();
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
  
  conversations.set(conversationId, {
    id: conversationId,
    messages: [],
    created_at: new Date().toISOString()
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
  
  // Store user message
  conversation.messages.push({
    message_id: uuidv4(),
    received_at,
    input,
    created_at: new Date().toISOString(),
    answer: '', // User message has no answer
    sources: []
  });
  
  if (stream) {
    // Set headers for streaming response
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const chunks = createStreamingChunks(aiResponse, messageId, conversationId);
    
    // Send chunks with realistic delays
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Add delay to simulate realistic streaming
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      
      try {
        res.write(JSON.stringify(chunk) + '\n');
      } catch (error) {
        console.error('Error writing chunk:', error);
        break;
      }
      
      // Store the final complete message
      if (chunk.end_of_stream) {
        conversation.messages.push({
          message_id: messageId,
          received_at,
          input,
          created_at: new Date().toISOString(),
          answer: chunk.answer,
          sources: chunk.sources
        });
      }
    }
    
    res.end();
  } else {
    // Non-streaming response
    const response = {
      message_id: messageId,
      conversation_id: conversationId,
      answer: aiResponse,
      received_at: new Date().toISOString(),
      sources: [{
        title: 'Red Hat Documentation',
        link: 'https://docs.redhat.com',
        score: 0.95,
        snippet: 'Official Red Hat documentation and knowledge base'
      }],
      tool_call_metadata: { tool_call: false },
      output_guard_result: { answer_relevance: 0.95 },
      end_of_stream: true,
      type: 'inference'
    };
    
    // Store AI message
    conversation.messages.push({
      message_id: messageId,
      received_at,
      input,
      created_at: new Date().toISOString(),
      answer: aiResponse,
      sources: response.sources
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
  
  // Convert conversations to history format
  const history = Array.from(conversations.values())
    .slice(0, parseInt(limit))
    .map(conv => ({
      conversation_id: conv.id,
      created_at: conv.created_at,
      message_count: conv.messages.length,
      last_message: conv.messages[conv.messages.length - 1]?.received_at || conv.created_at
    }));
  
  res.json(history);
});

// Get conversation quota
app.get('/api/ask/v1/quota/conversation', (req, res) => {
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
app.use((err, req, res) => {
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
  console.log(`   GET  /api/ask/v1/quota/conversation`);
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