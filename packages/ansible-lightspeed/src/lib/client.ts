import {
  AnsibleLightspeedConfig,
  QueryRequest,
  QueryResponse,
  FeedbackRequest,
  FeedbackResponse,
  StatusResponse,
  ConversationResponse,
  ConversationDeleteResponse,
  ModelsResponse,
  InfoResponse,
  Configuration,
  ReadinessResponse,
  LivenessResponse,
  AuthorizedResponse,
} from './types';
import { IAnsibleLightspeedClient } from './interfaces';
import {
  IMessageResponse,
  IConversationHistoryResponse,
  IConversation,
  ISendMessageOptions,
  IRequestOptions,
  IStreamingHandler,
  IInitErrorResponse,
} from '@redhat-cloud-services/ai-client-common';

/**
 * Error class for Ansible Lightspeed API errors
 */
export class AnsibleLightspeedError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'AnsibleLightspeedError';
  }
}

/**
 * Ansible Lightspeed API client
 */
export class AnsibleLightspeedClient implements IAnsibleLightspeedClient {
  private config: AnsibleLightspeedConfig;
  private fetchFunction: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(config: AnsibleLightspeedConfig) {
    this.config = config;
    this.fetchFunction = config.fetchFunction || ((input, init) => fetch(input, init));
  }

  getConfig(): AnsibleLightspeedConfig {
    return { ...this.config };
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${endpoint}`;
    
    const response = await this.fetchFunction(url, {
      ...options,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorResponse: unknown;
      
      try {
        errorResponse = await response.json();
        if (typeof errorResponse === 'object' && errorResponse !== null && 'detail' in errorResponse) {
          errorMessage = (errorResponse as { detail: string }).detail;
        }
      } catch {
        // Use default error message if response is not JSON
      }
      
      throw new AnsibleLightspeedError(errorMessage, response.status, errorResponse);
    }

    return response.json();
  }

  private async makeTextRequest(endpoint: string, options: RequestInit = {}): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${endpoint}`;
    
    const response = await this.fetchFunction(url, {
      ...options,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new AnsibleLightspeedError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    return response.text();
  }

  private async makeStreamRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${endpoint}`;
    
    const response = await this.fetchFunction(url, {
      ...options,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorResponse = await response.json();
        if (typeof errorResponse === 'object' && errorResponse !== null && 'detail' in errorResponse) {
          errorMessage = (errorResponse as { detail: string }).detail;
        }
      } catch {
        // Use default error message if response is not JSON
      }
      
      throw new AnsibleLightspeedError(errorMessage, response.status);
    }

    if (!response.body) {
      throw new AnsibleLightspeedError('Response body is null');
    }

    return response.body;
  }

  async query(request: QueryRequest): Promise<QueryResponse> {
    return this.makeRequest<QueryResponse>('/v1/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  }

  async streamingQuery(request: QueryRequest): Promise<ReadableStream<Uint8Array>> {
    return this.makeStreamRequest('/v1/streaming_query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  }

  async submitFeedback(request: FeedbackRequest): Promise<FeedbackResponse> {
    return this.makeRequest<FeedbackResponse>('/v1/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  }

  async getFeedbackStatus(): Promise<StatusResponse> {
    return this.makeRequest<StatusResponse>('/v1/feedback/status');
  }

  async getConversation(conversationId: string): Promise<ConversationResponse> {
    return this.makeRequest<ConversationResponse>(`/v1/conversations/${encodeURIComponent(conversationId)}`);
  }

  async deleteConversation(conversationId: string): Promise<ConversationDeleteResponse> {
    return this.makeRequest<ConversationDeleteResponse>(`/v1/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
    });
  }

  async getModels(): Promise<ModelsResponse> {
    return this.makeRequest<ModelsResponse>('/v1/models');
  }

  async getInfo(): Promise<InfoResponse> {
    return this.makeRequest<InfoResponse>('/v1/info');
  }

  async getConfiguration(): Promise<Configuration> {
    return this.makeRequest<Configuration>('/v1/config');
  }

  async getReadiness(): Promise<ReadinessResponse> {
    return this.makeRequest<ReadinessResponse>('/readiness');
  }

  async getLiveness(): Promise<LivenessResponse> {
    return this.makeRequest<LivenessResponse>('/liveness');
  }

  async checkAuthorization(): Promise<AuthorizedResponse> {
    return this.makeRequest<AuthorizedResponse>('/authorized', {
      method: 'POST',
    });
  }

  async getMetrics(): Promise<string> {
    return this.makeTextRequest('/metrics');
  }

  // IAIClient interface implementation
  async init(): Promise<{
    initialConversationId: string;
    conversations: IConversation[];
    error?: IInitErrorResponse;
  }> {
    try {
      // Generate initial conversation ID
      const initialConversationId = this.generateConversationId();
      
      return {
        initialConversationId,
        conversations: [],
      };
    } catch (error) {
      const errorResponse: IInitErrorResponse = {
        message: error instanceof Error ? error.message : 'Unknown initialization error',
        status: 500,
      };
      
      return {
        initialConversationId: '',
        conversations: [],
        error: errorResponse,
      };
    }
  }

  async sendMessage(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions
  ): Promise<IMessageResponse> {
    const queryRequest: QueryRequest = {
      query: message,
      conversation_id: conversationId,
    };

    const response = await this.query(queryRequest);

    return {
      messageId: this.generateMessageId(),
      answer: response.response,
      conversationId: response.conversation_id || conversationId,
      createdAt: new Date().toISOString(),
    };
  }

  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse> {
    try {
      const conversation = await this.getConversation(conversationId);
      
      // Transform conversation history to the expected format
      if (conversation.chat_history && conversation.chat_history.length > 0) {
        const messages = conversation.chat_history[0] as any;
        if (messages.messages && Array.isArray(messages.messages)) {
          return messages.messages.map((msg: any, index: number) => ({
            message_id: `msg-${index}`,
            answer: msg.content,
            input: msg.type === 'user' ? msg.content : '',
          }));
        }
      }
      
      return [];
    } catch (error) {
      // Return empty array if conversation not found
      return [];
    }
  }

  async healthCheck(options?: IRequestOptions): Promise<unknown> {
    return this.getReadiness();
  }

  async createNewConversation(): Promise<IConversation> {
    const conversationId = this.generateConversationId();
    return {
      id: conversationId,
      title: 'New Ansible Conversation',
      locked: false,
    };
  }

  private generateConversationId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}