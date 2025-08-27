import { IFDClientConfig, RequestOptions } from './interfaces';
import {
  IAIClient,
  AIClientError,
  AIClientValidationError,
  ISendMessageOptions,
  IMessageResponse,
  IFetchFunction,
  IRequestOptions,
  IConversationHistoryResponse,
  IConversation,
  IInitErrorResponse,
  ClientInitLimitation,
} from '@redhat-cloud-services/ai-client-common';
import {
  NewConversationResponse,
  MessageChunkResponse,
  MessageFeedbackRequest,
  MessageFeedbackResponse,
  HealthCheck,
  StatusChecks,
  UserResponse,
  UserRequest,
  UserHistoryResponse,
  QuotaStatusResponse,
  IFDAdditionalAttributes,
  ConversationHistoryMessage,
  MessageQuotaStatus,
  ConversationQuotaStatus,
} from './types';
import { DefaultStreamingHandler } from './default-streaming-handler';

/**
 * Intelligent Front Door (IFD) API Client
 *
 * A flexible TypeScript client for the IFD API with dependency injection support
 * for custom fetch implementations and streaming handlers.
 */
export class IFDClient implements IAIClient<IFDAdditionalAttributes> {
  private readonly baseUrl: string;
  private readonly fetchFunction: IFetchFunction;

  constructor(config: IFDClientConfig) {
    this.baseUrl = config.baseUrl;
    this.fetchFunction =
      config.fetchFunction || ((input, init) => fetch(input, init));
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

      if (!response || !response.ok) {
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
  private async handleErrorResponse(response: Response | null): Promise<never> {
    let errorData: { detail?: unknown } | string;
    try {
      if (response) {
        errorData = await response.json();
      } else {
        errorData = 'Unknown error';
      }
    } catch {
      // If we can't parse JSON, use response text if response exists
      errorData = response ? await response.text() : 'Unknown error';
    }

    if (
      response &&
      response.status === 422 &&
      typeof errorData === 'object' &&
      errorData?.detail
    ) {
      const detail = errorData.detail;
      if (Array.isArray(detail)) {
        throw new AIClientValidationError(detail);
      } else {
        // Fallback for non-array validation errors
        throw new AIClientValidationError([
          {
            loc: ['unknown'],
            msg: typeof detail === 'string' ? detail : 'Validation failed',
            type: 'validation_error',
          },
        ]);
      }
    }

    throw new AIClientError(
      response ? response.status : 500,
      response ? response.statusText : 'Internal Server Error',
      response
        ? `API request failed: ${response.status} ${response.statusText}`
        : 'Network error occurred',
      errorData
    );
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    options?: RequestOptions
  ): Promise<NewConversationResponse> {
    return this.makeRequest<NewConversationResponse>(
      '/api/ask/v1/conversation',
      {
        method: 'POST',
        ...options,
      }
    );
  }

  async createNewConversation(): Promise<IConversation> {
    const response = await this.createConversation();
    return {
      id: response.conversation_id,
      title: 'New Conversation',
      locked: false,
      createdAt: new Date(),
    };
  }

  async init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
  }> {
    try {
      // ARH init procedure
      await this.healthCheck();
      await this.getServiceStatus();
      await this.getUserSettings();
      const history = await this.getUserHistory();
      const quota = await this.getConversationQuota();
      let quotaBreached = false;
      if (quota && quota.quota) {
        quotaBreached =
          quota.enabled && quota.quota?.limit <= quota.quota?.used;
      }

      const clientLimitation: ClientInitLimitation | undefined = quotaBreached
        ? {
            reason: 'quota-breached',
            detail: 'Conversation quota has been reached',
          }
        : undefined;

      const conversations: IConversation[] = history.map((conversation) => {
        return {
          id: conversation.conversation_id,
          title: conversation.title,
          locked: !conversation.is_latest,
          createdAt: new Date(conversation.created_at),
        };
      });

      return {
        conversations,
        limitation: clientLimitation,
      };
    } catch (error) {
      console.error('ARH Client initialization failed:', error);
      const errorResponse: IInitErrorResponse = {
        message:
          error instanceof AIClientValidationError
            ? 'Request validation failed'
            : error instanceof AIClientError
            ? error.message
            : error instanceof Error
            ? error.message
            : typeof error === 'string'
            ? error
            : 'Unknown error occurred',
        status: error instanceof AIClientError ? error.status : 500,
      };
      throw errorResponse;
    }
  }

  /**
   * Send a message to a conversation (non-streaming)
   * For streaming, use sendMessageStream method
   */
  /**
   * Send a message to the AI service
   * Supports both streaming and non-streaming modes based on options.stream
   */
  async sendMessage(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions
  ): Promise<IMessageResponse> {
    const requestBody = {
      input: message,
      received_at: new Date().toISOString(),
      stream: options?.stream || false,
    };

    if (options?.stream) {
      // Handle streaming mode with self-contained handler
      const url = `${this.baseUrl}/api/ask/v1/conversation/${conversationId}/message`;
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      try {
        const response = await this.fetchFunction(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: options.signal,
        });

        if (!response.ok) {
          return this.handleErrorResponse(response);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        // Create self-contained streaming handler
        const handleChunk = options?.handleChunk || (() => {}); // fallback for safety
        const handler = new DefaultStreamingHandler(
          response,
          conversationId,
          handleChunk,
          this.getMessageQuota.bind(this)
        );

        return await handler.getResult();
      } catch (error) {
        throw error;
      }
    } else {
      // Handle non-streaming mode
      const response = await this.makeRequest<MessageChunkResponse>(
        `/api/ask/v1/conversation/${conversationId}/message`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
          ...options,
        }
      );

      const quota = await this.getMessageQuota(conversationId);
      let messageDate: Date;
      try {
        messageDate = new Date(response.received_at);
      } catch (error) {
        messageDate = new Date();
      }
      const messageResponse: IMessageResponse<IFDAdditionalAttributes> = {
        answer: response.answer,
        messageId: response.message_id,
        conversationId: response.conversation_id,
        date: messageDate,
        additionalAttributes: {
          sources: response.sources,
          tool_call_metadata: response.tool_call_metadata,
          output_guard_result: response.output_guard_result,
          quota,
        },
      };

      return messageResponse;
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<IFDAdditionalAttributes>> {
    const conversationMessages = await this.makeRequest<
      ConversationHistoryMessage[]
    >(`/api/ask/v1/conversation/${conversationId}/history`, {
      method: 'GET',
      ...options,
    });
    if (!conversationMessages || !Array.isArray(conversationMessages)) {
      return null;
    }

    const response: IConversationHistoryResponse<IFDAdditionalAttributes> =
      conversationMessages.map((msg) => {
        let messageDate: Date;
        try {
          messageDate = new Date(msg.received_at);
        } catch (error) {
          messageDate = new Date();
        }
        return {
          answer: msg.answer,
          input: msg.input,
          message_id: msg.message_id,
          conversationId: conversationId,
          date: messageDate,
          additionalAttributes: {
            sources: msg.sources ?? [],
            tool_call_metadata: msg.tool_call_metadata || null,
            output_guard_result: msg.output_guard_result || null,
          },
        };
      });
    return response;
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

    const path = `/api/ask/v1/user/current/history${
      searchParams.toString() ? '?' + searchParams.toString() : ''
    }`;

    return this.makeRequest<UserHistoryResponse>(path, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Get conversation quota status
   */
  async getConversationQuota(options?: RequestOptions) {
    return this.makeRequest<QuotaStatusResponse<ConversationQuotaStatus>>(
      '/api/ask/v1/quota/conversations',
      {
        method: 'GET',
        ...options,
      }
    );
  }

  /**
   * Get message quota status for a conversation
   */
  async getMessageQuota(conversationId: string, options?: RequestOptions) {
    return this.makeRequest<QuotaStatusResponse<MessageQuotaStatus>>(
      `/api/ask/v1/quota/${conversationId}/messages`,
      {
        method: 'GET',
        ...options,
      }
    );
  }
}
