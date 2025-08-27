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
   * Initialize the client and return the initial conversation ID
   * @returns Promise that resolves to a new conversation ID
   */
  async init(): Promise<{
    conversations: IConversation[];
  }> {
    // Just a stub for now - no auto-creation of conversations
    return { conversations: [] };
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
    // Determine media type from options, defaulting to text/plain for backward compatibility
    const mediaType = options?.mediaType || 'text/plain';

    const request: LLMRequest = {
      query: message,
      conversation_id: conversationId,
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
      const handleChunk = options?.afterChunk || (() => {}); // fallback for safety
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
    const conversationId = this.generateConversationId();
    const newConversation: IConversation = {
      id: conversationId,
      title: 'New Conversation',
      locked: false,
      createdAt: new Date(),
    };

    // In a real implementation, you would likely want to store this conversation
    // in some state management or database. Here we just return it.
    return newConversation;
  }

  /**
   * Get the conversation history for a specific conversation
   * Note: Lightspeed API doesn't have a dedicated history endpoint in v1.0.1
   * @param conversationId - The conversation ID to retrieve history for
   * @param options - Optional request configuration
   * @returns Promise that resolves to null (not implemented in API)
   */
  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<LightSpeedCoreAdditionalProperties>> {
    // Lightspeed API v1.0.1 doesn't have a dedicated history endpoint
    // This is documented in the OpenAPI spec - only query endpoints exist
    console.warn(
      `getConversationHistory is not implemented for conversation ${conversationId} - Lightspeed API does not have a history endpoint`,
      options
    );
    return [];
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
  // Private helper methods
  // ====================

  /**
   * Build URL with optional user_id query parameter as per OpenAPI spec
   * @param path - The endpoint path
   * @param userId - Optional user ID query parameter
   * @returns Complete URL with query parameters if needed
   */
  private buildUrl(path: string, userId?: string): string {
    const url = new URL(path, this.baseUrl);
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
