import {
  IAIClient,
  IConversation,
  IConversationHistoryResponse,
  IInitErrorResponse,
  IMessageResponse,
  ISendMessageOptions,
  IRequestOptions,
  ClientInitLimitation,
  AIClientError,
} from '@redhat-cloud-services/ai-client-common';
import {
  HCCAIAssistantAdditionalProperties,
  HCCAIAssistantClientConfig,
  HCCAIAssistantRequest,
  HCCAIAssistantAPIResponse,
  HCCAIAssistantConversationsListResponse,
  HCCAIAssistantConversationResponse,
  HCCAIAssistantUnauthorizedError,
  HCCAIAssistantValidationError,
  HCCAIAssistantQuotaExceededError,
  HCCAIAssistantServerError,
  extractErrorMessage,
} from './types';

const TEMP_CONVERSATION_ID = '__temp_hcc_ai_assistant_conversation__';

export class HCCAIAssistantClient
  implements IAIClient<HCCAIAssistantAdditionalProperties>
{
  private readonly baseUrl: string;
  private readonly fetchFunction: typeof fetch;
  private readonly provider?: string;
  private readonly model?: string;
  private readonly generateTopicSummary?: boolean;

  constructor(config: HCCAIAssistantClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetchFunction = config.fetchFunction || fetch;
    this.provider = config.provider;
    this.model = config.model;
    this.generateTopicSummary = config.generateTopicSummary;
  }

  async init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
    error?: IInitErrorResponse;
  }> {
    try {
      const response =
        await this.makeRequest<HCCAIAssistantConversationsListResponse>(
          '/v1/conversations',
          { method: 'GET' }
        );

      return {
        conversations: response.conversations.map((conv) => ({
          id: conv.conversation_id,
          title: conv.topic_summary || 'New Conversation',
          locked: false,
          createdAt: conv.created_at ? new Date(conv.created_at) : new Date(),
        })),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async sendMessage<
    T extends Record<string, unknown> = Record<string, unknown>,
    R extends Record<string, unknown> = Record<string, unknown>
  >(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions<T, R>
  ): Promise<IMessageResponse<HCCAIAssistantAdditionalProperties>> {
    const request: HCCAIAssistantRequest = {
      query: message,
    };

    if (this.provider !== undefined) {
      request.provider = this.provider;
    }

    if (this.model !== undefined) {
      request.model = this.model;
    }

    if (this.generateTopicSummary !== undefined) {
      request.generate_topic_summary = this.generateTopicSummary;
    }

    if (conversationId !== TEMP_CONVERSATION_ID) {
      request.conversation_id = conversationId;
    }

    try {
      const response = await this.makeRequest<HCCAIAssistantAPIResponse>(
        '/v1/query',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          body: JSON.stringify(request),
          signal: options?.signal,
        }
      );

      return {
        messageId: crypto.randomUUID(),
        answer: response.response,
        conversationId: response.conversation_id,
        date: new Date(),
        additionalAttributes: {
          referencedDocuments: response.referenced_documents,
          truncated: response.truncated,
          inputTokens: response.input_tokens,
          outputTokens: response.output_tokens,
        },
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async createNewConversation(): Promise<IConversation> {
    return {
      id: TEMP_CONVERSATION_ID,
      title: 'New Conversation',
      locked: false,
      createdAt: new Date(),
    };
  }

  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<HCCAIAssistantAdditionalProperties>> {
    try {
      const response =
        await this.makeRequest<HCCAIAssistantConversationResponse>(
          `/v1/conversations/${conversationId}`,
          {
            method: 'GET',
            headers: options?.headers,
            signal: options?.signal,
          }
        );

      return response.chat_history.flatMap((turn) =>
        turn.messages
          .filter((msg) => msg.type === 'user' || msg.type === 'assistant')
          .map((msg) => ({
            message_id: crypto.randomUUID(),
            answer: msg.type === 'assistant' ? msg.content : '',
            input: msg.type === 'user' ? msg.content : '',
            date: new Date(turn.started_at),
            additionalAttributes: msg.referenced_documents
              ? { referencedDocuments: msg.referenced_documents }
              : undefined,
          }))
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  async healthCheck(options?: IRequestOptions): Promise<unknown> {
    try {
      return await this.makeRequest('/v1/health', {
        method: 'GET',
        headers: options?.headers,
        signal: options?.signal,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private async makeRequest<T = unknown>(
    endpoint: string,
    options: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await this.fetchFunction(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);

      if (response.status === 401) {
        throw new HCCAIAssistantUnauthorizedError(
          extractErrorMessage(errorBody, 'Unauthorized'),
          errorBody
        );
      }

      if (response.status === 422) {
        throw new HCCAIAssistantValidationError(
          extractErrorMessage(errorBody, 'Validation error'),
          errorBody
        );
      }

      if (response.status === 429) {
        throw new HCCAIAssistantQuotaExceededError(
          extractErrorMessage(errorBody, 'Quota exceeded'),
          errorBody
        );
      }

      if (response.status >= 500) {
        throw new HCCAIAssistantServerError(
          response.status,
          extractErrorMessage(errorBody, 'Server error'),
          errorBody
        );
      }

      throw new AIClientError(
        response.status,
        response.statusText,
        extractErrorMessage(errorBody, `HTTP ${response.status}`),
        errorBody
      );
    }

    return response.json();
  }

  private handleError(error: unknown): never {
    if (error instanceof AIClientError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new AIClientError(0, 'Network Error', error.message, error);
    }

    throw new AIClientError(
      0,
      'Unknown Error',
      'An unknown error occurred',
      error
    );
  }
}
