import {
  IAIClient,
  IBaseClientConfig,
  IRequestOptions,
  ISendMessageOptions,
  IMessageResponse,
  IConversationHistoryResponse,
  IConversation,
  ClientInitLimitation,
  IInitErrorResponse,
  IFetchFunction,
} from '@redhat-cloud-services/ai-client-common';
import { AAIDefaultStreamingHandler } from './sse-streaming-handler';
import {
  AAIAdditionalAttributes,
  AAIRequestBody,
  AAISSEEvent
} from './types';

/**
 * Configuration options for the AAI client
 */
export interface AAIClientConfig extends IBaseClientConfig {
  // Inherits baseUrl and fetchFunction from IBaseClientConfig
}

// Extended send message options for AAI
export interface AAISendMessageOptions extends ISendMessageOptions<Record<string, unknown>> {
  requestBody: AAIRequestBody; // Required for AAI client
}

/**
 * Ansible Assisted Installer (AAI) API Client
 *
 * A TypeScript client for the AAI API with Server-Sent Events streaming support.
 */
export class AAIClient implements IAIClient<AAIAdditionalAttributes> {
  private readonly baseUrl: string;
  private readonly fetchFunction: IFetchFunction;

  constructor(config: AAIClientConfig) {
    this.baseUrl = config.baseUrl;
    this.fetchFunction = config.fetchFunction || ((input, init) => fetch(input, init));
  }

  /**
   * Initialize the client and return existing conversations
   */
  async init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
    error?: IInitErrorResponse;
  }> {
    // Stubbed implementation
    return {
      conversations: [],
    };
  }

  /**
   * Send a message to the AI service
   */
  async sendMessage(
    conversationId: string,
    message: string,
    options?: AAISendMessageOptions
  ): Promise<IMessageResponse<AAIAdditionalAttributes>> {
    // Note: conversationId parameter will be needed even though AAI may handle conversations via cookies/session
    if (!options?.requestBody) {
      throw new Error('requestBody is required in options');
    }

    const requestBody: AAIRequestBody = {
      media_type: "application/json", // Default fallback
      ...options.requestBody,
      query: message, // Always use the message parameter for query
    };

    // Only include conversation_id if it's not a temporary conversation
    if (conversationId && conversationId !== '__temp_conversation__' && conversationId !== '__aai_temp_conversation__') {
      requestBody.conversation_id = conversationId;
    }

    const response = await this.fetchFunction(`${this.baseUrl}/api/v1/ai/streaming_chat/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    // Verify response is Server-Sent Events
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('text/event-stream')) {
      throw new Error(`Expected text/event-stream but got: ${contentType}`);
    }

    if (options?.stream) {
      // Create self-contained streaming handler
      const handleChunk = options?.handleChunk || (() => {}); // fallback for safety
      const handler = new AAIDefaultStreamingHandler(
        response,
        conversationId,
        handleChunk
      );
      
      return await handler.getResult();
    }

    // There is no non streaming variant
    throw new Error('Non-streaming sendMessage is not supported in AAI client');
  }


  /**
   * Get the conversation history for a specific conversation
   */
  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<AAIAdditionalAttributes>> {
    // Stubbed implementation
    return [];
  }

  /**
   * Perform a health check on the AI service
   */
  async healthCheck(options?: IRequestOptions): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  /**
   * Get the current status of the AI service
   */
  async getServiceStatus(options?: IRequestOptions): Promise<{
    'chatbot-service': string;
    'streaming-chatbot-service': string;
  }> {
    return this.makeRequest<{
      'chatbot-service': string;
      'streaming-chatbot-service': string;
    }>('/api/v1/health/status/chatbot/', {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Make a standard HTTP request
   */
  private async makeRequest<T>(
    path: string,
    options: RequestInit & IRequestOptions = {}
  ): Promise<T> {
    const { headers: customHeaders, signal, ...fetchOptions } = options;

    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    try {
      const response = await this.fetchFunction(url, {
        ...fetchOptions,
        headers,
        signal,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Unknown error occurred: ${JSON.stringify(error)}`);
    }
  }

  /**
   * Create a new conversation
   */
  async createNewConversation(): Promise<IConversation> {
    // For AAI, conversations are created server-side during the first message
    // Return a AAI-specific temporary conversation that will be replaced when the server responds
    return {
      id: '__aai_temp_conversation__',
      title: 'New Conversation',
      locked: false,
      createdAt: new Date(),
    };
  }
}