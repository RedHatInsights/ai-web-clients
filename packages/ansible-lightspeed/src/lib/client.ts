import {
  AnsibleLightspeedConfig,
  AnsibleLightspeedMessageAttributes,
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
import {
  IMessageResponse,
  IConversationHistoryResponse,
  IConversation,
  ISendMessageOptions,
  IRequestOptions,
  IStreamingHandler,
  IInitErrorResponse,
  IAIClient,
} from '@redhat-cloud-services/ai-client-common';
import {
  DefaultStreamingHandler,
  processStreamWithHandler,
} from './default-streaming-handler';
import { StreamingEvent } from './streaming-types';

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
export class AnsibleLightspeedClient
  implements IAIClient<AnsibleLightspeedMessageAttributes, StreamingEvent>
{
  private config: AnsibleLightspeedConfig;
  private fetchFunction: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
  private defaultStreamingHandler: IStreamingHandler<StreamingEvent>;

  constructor(config: AnsibleLightspeedConfig) {
    this.config = config;
    this.fetchFunction =
      config.fetchFunction || ((input, init) => fetch(input, init));
    this.defaultStreamingHandler =
      config.defaultStreamingHandler || new DefaultStreamingHandler();
  }

  getConfig(): AnsibleLightspeedConfig {
    return { ...this.config };
  }

  /**
   * Get the default streaming handler configured for this client
   */
  getDefaultStreamingHandler<TChunk = StreamingEvent>():
    | IStreamingHandler<TChunk>
    | undefined {
    return this.defaultStreamingHandler as
      | IStreamingHandler<TChunk>
      | undefined;
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
        if (
          typeof errorResponse === 'object' &&
          errorResponse !== null &&
          'detail' in errorResponse
        ) {
          errorMessage = (errorResponse as { detail: string }).detail;
        }
      } catch {
        // Use default error message if response is not JSON
      }

      throw new AnsibleLightspeedError(
        errorMessage,
        response.status,
        errorResponse
      );
    }

    return response.json();
  }

  private async makeTextRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<string> {
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
  ): Promise<Response> {
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
        if (
          typeof errorResponse === 'object' &&
          errorResponse !== null &&
          'detail' in errorResponse
        ) {
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

    return response;
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

  async streamingQuery(request: QueryRequest): Promise<Response> {
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
    return this.makeRequest<ConversationResponse>(
      `/v1/conversations/${encodeURIComponent(conversationId)}`
    );
  }

  async deleteConversation(
    conversationId: string
  ): Promise<ConversationDeleteResponse> {
    return this.makeRequest<ConversationDeleteResponse>(
      `/v1/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'DELETE',
      }
    );
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
    conversations: IConversation[];
    error?: IInitErrorResponse;
  }> {
    try {
      // No longer auto-creating conversations
      return {
        conversations: [],
      };
    } catch (error) {
      const errorResponse: IInitErrorResponse = {
        message:
          error instanceof Error
            ? error.message
            : 'Unknown initialization error',
        status: 500,
      };

      return {
        conversations: [],
        error: errorResponse,
      };
    }
  }

  async sendMessage(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions
  ): Promise<IMessageResponse<AnsibleLightspeedMessageAttributes> | void> {
    const queryRequest: QueryRequest = {
      query: message,
      conversation_id: conversationId,
      provider: options?.headers?.['x-provider'],
      model: options?.headers?.['x-model'],
    };

    if (options?.stream) {
      // Handle streaming mode
      const handler = this.defaultStreamingHandler;
      if (!handler) {
        throw new AnsibleLightspeedError(
          'Streaming mode requires a streaming handler to be configured'
        );
      }

      try {
        const response = await this.streamingQuery(queryRequest);
        await processStreamWithHandler(response, handler, options?.afterChunk);
      } catch (error) {
        handler.onError?.(error as Error);
        throw error;
      }
    } else {
      // Handle non-streaming mode
      const response = await this.query(queryRequest);

      // Extract additional attributes from the request/response context
      const additionalAttributes: AnsibleLightspeedMessageAttributes = {
        provider: queryRequest.provider,
        model: queryRequest.model,
        // These would be populated from streaming end events or response metadata
        // For now, we'll set them as undefined since the basic query doesn't return this info
        input_tokens: undefined,
        output_tokens: undefined,
        referenced_documents: undefined,
        truncated: undefined,
        available_quotas: undefined,
      };

      return {
        messageId: this.generateMessageId(),
        answer: response.response,
        conversationId: response.conversation_id || conversationId,
        date: new Date(),
        additionalAttributes,
      };
    }
  }

  async getConversationHistory(
    conversationId: string,
    _options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<AnsibleLightspeedMessageAttributes>> {
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
            additionalAttributes: {
              // Populate from message metadata if available
              provider: undefined,
              model: undefined,
              input_tokens: undefined,
              output_tokens: undefined,
              referenced_documents: undefined,
              truncated: undefined,
              available_quotas: undefined,
            } as AnsibleLightspeedMessageAttributes,
          }));
        }
      }

      return [];
    } catch (error) {
      // Return empty array if conversation not found
      return [];
    }
  }

  async healthCheck(_options?: IRequestOptions): Promise<unknown> {
    return this.getReadiness();
  }

  async createNewConversation(): Promise<IConversation> {
    const conversationId = this.generateConversationId();
    return {
      id: conversationId,
      title: 'New Ansible Conversation',
      locked: false,
      createdAt: new Date(),
    };
  }

  private generateConversationId(): string {
    return crypto.randomUUID();
  }

  private generateMessageId(): string {
    return crypto.randomUUID();
  }
}
