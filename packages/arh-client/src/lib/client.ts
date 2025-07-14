import {
  IFDClientConfig,
  RequestOptions,
  StreamingRequestOptions,
  IFetchFunction
} from './interfaces';
import {
  NewConversationResponse,
  ConversationHistoryResponse,
  MessageRequest,
  MessageChunkResponse,
  MessageFeedbackRequest,
  MessageFeedbackResponse,
  HealthCheck,
  StatusChecks,
  UserResponse,
  UserRequest,
  UserHistoryResponse,
  QuotaStatusResponse,
  IFDApiError,
  IFDValidationError
} from './types';
import { processStreamWithHandler } from './default-streaming-handler';

/**
 * Intelligent Front Door (IFD) API Client
 * 
 * A flexible TypeScript client for the IFD API with dependency injection support
 * for custom fetch implementations and streaming handlers.
 */
export class IFDClient {
  private readonly baseUrl: string;
  private readonly fetchFunction: IFetchFunction;

  constructor(config: IFDClientConfig) {
    this.baseUrl = config.baseUrl;
    this.fetchFunction = config.fetchFunction;
  }

  /**
   * Make a standard HTTP request
   */
  private async makeRequest<T>(
    path: string,
    options: RequestInit & RequestOptions = {}
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
        await this.handleErrorResponse(response);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle error responses
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: { detail?: unknown } | string;
    try {
      errorData = await response.json();
    } catch {
      // If we can't parse JSON, use response text
      errorData = await response.text();
    }

    if (response.status === 422 && typeof errorData === 'object' && errorData?.detail) {
      const detail = errorData.detail;
      if (Array.isArray(detail)) {
        throw new IFDValidationError(detail);
      } else {
        // Fallback for non-array validation errors
        throw new IFDValidationError([{
          loc: ['unknown'],
          msg: typeof detail === 'string' ? detail : 'Validation failed',
          type: 'validation_error'
        }]);
      }
    }

    throw new IFDApiError(
      response.status,
      response.statusText,
      `API request failed: ${response.status} ${response.statusText}`,
      errorData
    );
  }

  /**
   * Create a new conversation
   */
  async createConversation(options?: RequestOptions): Promise<NewConversationResponse> {
    return this.makeRequest<NewConversationResponse>('/api/ask/v1/conversation', {
      method: 'POST',
      ...options,
    });
  }

  /**
   * Send a message to a conversation (non-streaming)
   * For streaming, use sendMessageStream method
   */
  async sendMessage(
    conversationId: string,
    message: MessageRequest,
    options?: RequestOptions
  ): Promise<MessageChunkResponse> {
    const requestBody = { ...message, stream: false };
    
    return this.makeRequest<MessageChunkResponse>(
      `/api/ask/v1/conversation/${conversationId}/message`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
        ...options,
      }
    );
  }

  /**
   * Send a message to a conversation with streaming response
   * This method requires a streaming handler to be provided
   */
  async sendMessageStream(
    conversationId: string,
    message: MessageRequest,
    options: StreamingRequestOptions
  ): Promise<void> {
    const { streamingHandler, ...requestOptions } = options;
    const requestBody = { ...message, stream: true };

    const url = `${this.baseUrl}/api/ask/v1/conversation/${conversationId}/message`;
    const headers = {
      'Content-Type': 'application/json',
      ...requestOptions.headers,
    };

    try {
      const response = await this.fetchFunction(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: requestOptions.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      await processStreamWithHandler(response, streamingHandler, conversationId);
    } catch (error) {
      streamingHandler.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    conversationId: string,
    options?: RequestOptions
  ): Promise<ConversationHistoryResponse> {
    return this.makeRequest<ConversationHistoryResponse>(
      `/api/ask/v1/conversation/${conversationId}/history`,
      {
        method: 'GET',
        ...options,
      }
    );
  }

  /**
   * Send feedback for a message
   */
  async sendMessageFeedback(
    conversationId: string,
    messageId: string,
    feedback: MessageFeedbackRequest,
    options?: RequestOptions
  ): Promise<MessageFeedbackResponse> {
    return this.makeRequest<MessageFeedbackResponse>(
      `/api/ask/v1/conversation/${conversationId}/message/${messageId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify(feedback),
        ...options,
      }
    );
  }

  /**
   * Health check endpoint
   */
  async healthCheck(options?: RequestOptions): Promise<HealthCheck> {
    return this.makeRequest<HealthCheck>('/api/ask/v1/health', {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Service status check
   */
  async getServiceStatus(options?: RequestOptions): Promise<StatusChecks> {
    return this.makeRequest<StatusChecks>('/api/ask/v1/status', {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Get current user settings
   */
  async getUserSettings(options?: RequestOptions): Promise<UserResponse> {
    return this.makeRequest<UserResponse>('/api/ask/v1/user/current', {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Update user settings
   */
  async updateUserSettings(
    userSettings: UserRequest,
    options?: RequestOptions
  ): Promise<UserResponse> {
    return this.makeRequest<UserResponse>('/api/ask/v1/user/current', {
      method: 'PUT',
      body: JSON.stringify(userSettings),
      ...options,
    });
  }

  /**
   * Get user history
   */
  async getUserHistory(
    limit?: number,
    options?: RequestOptions
  ): Promise<UserHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) {
      searchParams.append('limit', limit.toString());
    }
    
    const path = `/api/ask/v1/user/current/history${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
    
    return this.makeRequest<UserHistoryResponse>(path, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Get conversation quota status
   */
  async getConversationQuota(options?: RequestOptions): Promise<QuotaStatusResponse> {
    return this.makeRequest<QuotaStatusResponse>('/api/ask/v1/quota/conversations', {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Get message quota status for a conversation
   */
  async getMessageQuota(
    conversationId: string,
    options?: RequestOptions
  ): Promise<QuotaStatusResponse> {
    return this.makeRequest<QuotaStatusResponse>(
      `/api/ask/v1/quota/${conversationId}/messages`,
      {
        method: 'GET',
        ...options,
      }
    );
  }
} 