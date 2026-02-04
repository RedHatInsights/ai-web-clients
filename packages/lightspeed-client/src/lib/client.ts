import {
  LightspeedClientConfig,
  LightspeedSendMessageOptions,
} from './interfaces';
import {
  IAIClient,
  IMessageResponse,
  IFetchFunction,
  IRequestOptions,
  IConversationHistoryResponse,
  IConversation,
} from '@redhat-cloud-services/ai-client-common';
import {
  LLMRequest,
  LLMResponse,
  FeedbackRequest,
  FeedbackResponse,
  StatusResponse,
  AuthorizationResponse,
  ReadinessResponse,
  LivenessResponse,
  HealthCheck,
  LightspeedClientError,
  LightspeedValidationError,
  LightSpeedCoreAdditionalProperties,
  InfoResponse,
  ModelsResponse,
  Configuration,
  ConversationsListResponse,
  ConversationResponse,
  ConversationDeleteResponse,
  FeedbackStatusUpdateRequest,
  FeedbackStatusUpdateResponse,
  TEMP_CONVERSATION_ID,
} from './types';
import { DefaultStreamingHandler } from './default-streaming-handler';

/**
 * OpenShift Lightspeed API Client
 *
 * A flexible TypeScript client for the Lightspeed API with dependency injection support
 * for custom fetch implementations and streaming handlers.
 *
 * Implements the exact OpenAPI specification for Lightspeed v1.0.1
 */
export class LightspeedClient
  implements IAIClient<LightSpeedCoreAdditionalProperties>
{
  private readonly baseUrl: string;
  private readonly fetchFunction: IFetchFunction;

  constructor(config: LightspeedClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.fetchFunction =
      config.fetchFunction || ((input, init) => fetch(input, init));
  }

  // ====================
  // IAIClient Interface Implementation
  // ====================

  /**
   * Initialize the client and return existing conversations
   * @returns Promise that resolves to existing conversations
   */
  async init(): Promise<{
    conversations: IConversation[];
  }> {
    try {
      const conversationsResponse = await this.getConversations();

      const conversations: IConversation[] =
        conversationsResponse.conversations.map((conv) => ({
          id: conv.conversation_id,
          title:
            conv.topic_summary ||
            `Conversation (${conv.message_count || 0} messages)`,
          locked: false,
          createdAt: conv.created_at ? new Date(conv.created_at) : new Date(),
        }));

      return { conversations };
    } catch (error) {
      console.warn('Failed to load existing conversations:', error);
      return { conversations: [] };
    }
  }

  /**
   * Send a message to the Lightspeed API
   * Supports both streaming and non-streaming modes with dual media types
   * @param conversationId - The conversation ID to send the message to
   * @param message - The message content to send
   * @param options - Optional configuration for the request including media type
   * @returns Promise that resolves to the AI's response
   */
  async sendMessage(
    conversationId: string,
    message: string,
    options?: LightspeedSendMessageOptions & {
      userId?: string;
    }
  ): Promise<IMessageResponse<LightSpeedCoreAdditionalProperties>> {
    // Determine media type from options, defaulting to application/json
    const mediaType = options?.mediaType || 'application/json';

    const request: LLMRequest = {
      query: message,
      // Omit conversation_id if it's the temporary ID - let API auto-generate
      conversation_id:
        conversationId === TEMP_CONVERSATION_ID ? undefined : conversationId,
      media_type: mediaType,
    };

    if (options?.stream) {
      // Streaming request - use self-contained handler approach
      const url = this.buildUrl('/v1/streaming_query', options?.userId);
      const response = await this.makeRequest<Response>(url, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json',
          Accept:
            mediaType === 'application/json'
              ? 'application/json'
              : 'text/plain',
          ...options?.headers,
        },
        signal: options?.signal,
      });

      // Create self-contained streaming handler
      // Always provide handleChunk callback (state manager should provide this)
      const handleChunk = options?.handleChunk || (() => {}); // fallback for safety
      const handler = new DefaultStreamingHandler(
        response,
        conversationId,
        mediaType,
        handleChunk
      );

      return await handler.getResult();
    } else {
      // Non-streaming request
      const url = this.buildUrl('/v1/query', options?.userId);
      const response = await this.makeRequest<LLMResponse>(url, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...options?.headers,
        },
        signal: options?.signal,
      });

      // Convert LLMResponse to IMessageResponse format for common interface compatibility
      const messageResponse: IMessageResponse<LightSpeedCoreAdditionalProperties> =
        {
          messageId: this.generateMessageId(),
          answer: response.response,
          date: new Date(),
          conversationId: response.conversation_id,
          additionalAttributes: {
            referencedDocuments: response.referenced_documents,
            truncated: response.truncated,
            inputTokens: response.input_tokens,
            outputTokens: response.output_tokens,
            availableQuotas: response.available_quotas,
            toolCalls: response.tool_calls,
            toolResults: response.tool_results,
          },
        };

      return messageResponse;
    }
  }

  async createNewConversation(): Promise<IConversation> {
    // Return temporary conversation ID - real conversation will be created on first sendMessage
    const newConversation: IConversation = {
      id: TEMP_CONVERSATION_ID,
      title: 'New Conversation',
      locked: false,
      createdAt: new Date(),
    };

    return newConversation;
  }

  /**
   * Get the conversation history (message history) for a specific conversation
   * Uses the /v1/conversations/{id} endpoint to get detailed message history
   * @param conversationId - The conversation ID to retrieve history for
   * @param options - Optional request configuration
   * @returns Promise that resolves to the conversation message history
   */
  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<LightSpeedCoreAdditionalProperties>> {
    // Handle temporary conversation ID - no history available yet
    if (conversationId === TEMP_CONVERSATION_ID) {
      return [];
    }

    try {
      // Get conversation data from the API
      const conversationData = await this.getConversation(
        conversationId,
        options
      );

      // Transform the API response to match IConversationHistoryResponse format
      const history = conversationData.chat_history.flatMap((turn) => {
        // Each turn has messages array with user/assistant pairs
        const messages = [];

        // Find user and assistant messages in this turn
        const userMessage = turn.messages.find((msg) => msg.type === 'user');
        const assistantMessage = turn.messages.find(
          (msg) => msg.type === 'assistant'
        );

        if (userMessage && assistantMessage) {
          // Create a conversation message entry for this Q&A pair
          messages.push({
            message_id: this.generateMessageId(),
            answer: assistantMessage.content,
            input: userMessage.content,
            date: new Date(turn.started_at),
            additionalAttributes: {
              // We don't have detailed attributes from the conversation endpoint
              // These would be available from the original query/response
              referencedDocuments: [],
              truncated: false,
              inputTokens: 0,
              outputTokens: 0,
              availableQuotas: {},
              toolCalls: [],
              toolResults: [],
            },
          });
        }

        return messages;
      });

      return history;
    } catch (error) {
      // If conversation doesn't exist or is inaccessible, return empty history
      if (error instanceof LightspeedClientError && error.status === 404) {
        return [];
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Perform a health check on the Lightspeed service
   * Combines readiness and liveness checks as per API spec
   * @param options - Optional request configuration
   * @returns Promise that resolves to health status information
   */
  async healthCheck(options?: IRequestOptions): Promise<HealthCheck> {
    try {
      // Run both readiness and liveness checks in parallel as per OpenAPI spec
      const [readinessResponse, livenessResponse] = await Promise.all([
        this.makeRequest<ReadinessResponse>('/readiness', {
          method: 'GET',
          headers: options?.headers,
          signal: options?.signal,
        }),
        this.makeRequest<LivenessResponse>('/liveness', {
          method: 'GET',
          headers: options?.headers,
          signal: options?.signal,
        }),
      ]);

      return {
        status: 'healthy',
        ready: readinessResponse.ready,
        alive: livenessResponse.alive,
        reason: readinessResponse.reason,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        ready: false,
        alive: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get the service status (feedback functionality status)
   * @param options - Optional request configuration
   * @returns Promise that resolves to service status information
   */
  async getServiceStatus(options?: IRequestOptions): Promise<StatusResponse> {
    return this.makeRequest<StatusResponse>('/v1/feedback/status', {
      method: 'GET',
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  // ====================
  // Lightspeed-Specific Methods (Following OpenAPI Spec)
  // ====================

  /**
   * Store user feedback for a conversation
   * @param feedback - The feedback data to store
   * @param options - Optional request configuration
   * @returns Promise that resolves to feedback response
   */
  async storeFeedback(
    feedback: FeedbackRequest,
    options?: IRequestOptions
  ): Promise<FeedbackResponse> {
    return this.makeRequest<FeedbackResponse>('/v1/feedback', {
      method: 'POST',
      body: JSON.stringify(feedback),
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: options?.signal,
    });
  }

  /**
   * Check if the user is authorized to access the Lightspeed service
   * @param userId - Optional user ID for authorization check
   * @param options - Optional request configuration
   * @returns Promise that resolves to authorization information
   */
  async checkAuthorization(
    userId?: string,
    options?: IRequestOptions
  ): Promise<AuthorizationResponse> {
    const url = this.buildUrl('/authorized', userId);
    return this.makeRequest<AuthorizationResponse>(url, {
      method: 'POST',
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  /**
   * Get service metrics
   * @param options - Optional request configuration
   * @returns Promise that resolves to metrics data as plain text
   */
  async getMetrics(options?: IRequestOptions): Promise<string> {
    const response = await this.makeRequest<Response>('/metrics', {
      method: 'GET',
      headers: options?.headers,
      signal: options?.signal,
    });

    return response.text();
  }

  // ====================
  // New API Endpoints (OpenAPI v0.2.0)
  // ====================

  /**
   * Get service information
   * @param options - Optional request configuration
   * @returns Promise that resolves to service info
   */
  async getServiceInfo(options?: IRequestOptions): Promise<InfoResponse> {
    return this.makeRequest<InfoResponse>('/v1/info', {
      method: 'GET',
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  /**
   * Get available models
   * @param options - Optional request configuration
   * @returns Promise that resolves to available models
   */
  async getModels(options?: IRequestOptions): Promise<ModelsResponse> {
    return this.makeRequest<ModelsResponse>('/v1/models', {
      method: 'GET',
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  /**
   * Get service configuration
   * @param options - Optional request configuration
   * @returns Promise that resolves to service configuration
   */
  async getConfiguration(options?: IRequestOptions): Promise<Configuration> {
    return this.makeRequest<Configuration>('/v1/config', {
      method: 'GET',
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  /**
   * List all conversations
   * @param options - Optional request configuration
   * @returns Promise that resolves to conversations list
   */
  async getConversations(
    options?: IRequestOptions
  ): Promise<ConversationsListResponse> {
    return this.makeRequest<ConversationsListResponse>('/v1/conversations', {
      method: 'GET',
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  /**
   * Get specific conversation by ID
   * @param conversationId - The conversation ID to retrieve
   * @param options - Optional request configuration
   * @returns Promise that resolves to conversation details
   */
  async getConversation(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<ConversationResponse> {
    return this.makeRequest<ConversationResponse>(
      `/v1/conversations/${conversationId}`,
      {
        method: 'GET',
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }

  /**
   * Delete a conversation by ID
   * @param conversationId - The conversation ID to delete
   * @param options - Optional request configuration
   * @returns Promise that resolves to deletion confirmation
   */
  async deleteConversation(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<ConversationDeleteResponse> {
    return this.makeRequest<ConversationDeleteResponse>(
      `/v1/conversations/${conversationId}`,
      {
        method: 'DELETE',
        headers: options?.headers,
        signal: options?.signal,
      }
    );
  }

  /**
   * Update feedback status
   * @param request - Feedback status update request
   * @param options - Optional request configuration
   * @returns Promise that resolves to status update response
   */
  async updateFeedbackStatus(
    request: FeedbackStatusUpdateRequest,
    options?: IRequestOptions
  ): Promise<FeedbackStatusUpdateResponse> {
    return this.makeRequest<FeedbackStatusUpdateResponse>(
      '/v1/feedback/status',
      {
        method: 'PUT',
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        signal: options?.signal,
      }
    );
  }

  // ====================
  // Private helper methods
  // ====================

  /**
   * Build URL with optional user_id query parameter as per OpenAPI spec
   * @param path - The endpoint path
   * @param userId - Optional user ID query parameter
   * @returns Complete URL with query parameters if needed
   */
  private buildUrl(path: string, userId?: string): string {
    const url = new URL(this.baseUrl);
    // Remove trailing slash from base URL and add path without leading slash.
    // We need this because the baseUrl may contain a path, so we need to merge the baseUrl path and the path from the argument.
    const basePath = url.pathname.replace(/\/$/, '');
    const cleanPath = path.replace(/^\/+/, '');
    url.pathname = cleanPath ? `${basePath}/${cleanPath}` : basePath;
    if (userId) {
      url.searchParams.set('user_id', userId);
    }
    return url.toString();
  }

  /**
   * Make an HTTP request to the Lightspeed API with proper error handling
   * @param urlOrPath - Full URL or endpoint path
   * @param options - Request options
   * @returns Promise that resolves to the response data
   */
  private async makeRequest<T>(
    urlOrPath: string,
    options: RequestInit
  ): Promise<T> {
    const url = urlOrPath.startsWith('http')
      ? urlOrPath
      : `${this.baseUrl}${urlOrPath}`;

    try {
      const response = await this.fetchFunction(url, options);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // For Response objects (like streaming or metrics), return as-is
      if (
        urlOrPath.includes('/streaming_query') ||
        urlOrPath.includes('/metrics')
      ) {
        return response as T;
      }

      // For JSON responses, parse and return
      return (await response.json()) as T;
    } catch (error) {
      if (
        error instanceof LightspeedClientError ||
        error instanceof LightspeedValidationError
      ) {
        throw error;
      }
      throw new LightspeedClientError(
        0,
        'Network Error',
        `Failed to make request to ${url}: ${error}`
      );
    }
  }

  /**
   * Handle error responses from the API according to OpenAPI spec
   * @param response - The error response
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    const statusText = response.statusText;

    try {
      const errorBody = await response.json();

      // Handle validation errors (422) - exact OpenAPI spec format
      if (
        status === 422 &&
        errorBody.detail &&
        Array.isArray(errorBody.detail)
      ) {
        throw new LightspeedValidationError(errorBody.detail);
      }

      // Handle other error formats based on OpenAPI spec
      let message: string;
      if (typeof errorBody.detail === 'string') {
        // UnauthorizedResponse, ForbiddenResponse format
        message = errorBody.detail;
      } else if (errorBody.detail?.response) {
        // ErrorResponse format
        message = errorBody.detail.response;
      } else if (errorBody.detail?.cause) {
        // ErrorResponse format
        message = errorBody.detail.cause;
      } else if (errorBody.message) {
        // Generic message field
        message = errorBody.message;
      } else {
        message = statusText || 'Unknown error';
      }

      throw new LightspeedClientError(status, statusText, message, response);
    } catch (parseError) {
      // If parseError is our own thrown error, re-throw it
      if (
        parseError instanceof LightspeedClientError ||
        parseError instanceof LightspeedValidationError
      ) {
        throw parseError;
      }

      // If we can't parse the error response, throw a generic error
      throw new LightspeedClientError(
        status,
        statusText,
        `HTTP ${status}: ${statusText}`,
        response
      );
    }
  }

  /**
   * Generate a new conversation ID (UUID v4)
   * @returns A new UUID string
   */
  private generateConversationId(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate a new message ID
   * @returns A new message ID string
   */
  private generateMessageId(): string {
    return crypto.randomUUID();
  }
}
