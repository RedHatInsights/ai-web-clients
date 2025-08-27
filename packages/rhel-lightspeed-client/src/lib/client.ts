import { 
  IAIClient,
  IConversation,
  IConversationHistoryResponse,
  IInitErrorResponse,
  IMessageResponse,
  ISendMessageOptions,
  IRequestOptions,
  ClientInitLimitation,
  AIClientError
} from '@redhat-cloud-services/ai-client-common';
import { 
  RHELLightspeedAdditionalProperties, 
  RHELLightspeedClientConfig,
  RHELLightspeedRequestPayload,
  RHELLightspeedValidationError,
  RHELLightspeedServerError,
  Query,
  RAGResponse
} from './types';

export class RHELLightspeedClient implements IAIClient<RHELLightspeedAdditionalProperties> {
  private config: RHELLightspeedClientConfig;
  private fetchFunction: typeof fetch;

  constructor(config: RHELLightspeedClientConfig) {
    this.config = config;
    this.fetchFunction = config.fetchFunction || fetch;
  }

  /**
   * Initialize the client - RAG system doesn't maintain server-side conversations
   * Always returns empty conversations array
   */
  async init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
    error?: IInitErrorResponse;
  }> {
    return {
      conversations: []
    };
  }

  /**
   * Send message to RAG inference endpoint
   * Always uses non-streaming mode regardless of stream option
   */
  async sendMessage<
    T extends Record<string, unknown> = Record<string, unknown>,
    R extends Record<string, unknown> = RHELLightspeedRequestPayload
  >(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions<T, R>
  ): Promise<IMessageResponse<RHELLightspeedAdditionalProperties>> {
    const requestPayload = options?.requestPayload as RHELLightspeedRequestPayload | undefined;
    
    // Build query payload
    const query: Query = {
      question: message,
      context: requestPayload?.context,
      skip_rag: requestPayload?.skip_rag || false
    };

    try {
      const response = await this.makeRequest<{
        data: {
          text: string;
          request_id: string;
        }
      }>('/infer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        body: JSON.stringify(query),
        signal: options?.signal,
      });

      // Transform real server response to IAIClient format
      return {
        messageId: response.data.request_id,
        answer: response.data.text,
        conversationId: conversationId,
        date: new Date(),
        additionalAttributes: {
          rag_metadata: {
            skip_rag: requestPayload?.skip_rag || false,
            sources_consulted: 0,
            knowledge_base_version: 'unknown',
            confidence_score: 1.0,
          },
          context_metadata: requestPayload?.context ? {
            has_systeminfo: !!requestPayload.context.systeminfo,
            has_terminal_output: !!requestPayload.context.terminal,
            has_attachments: false,
            has_stdin: false,
            has_cla_info: false,
          } : null,
          sources: [],
          original_question: message,
        },
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Create new conversation with client-generated UUID
   * RAG system doesn't persist conversations server-side
   */
  async createNewConversation(): Promise<IConversation> {
    const conversationId = 'rhel-lightspeed-conversation';
    return {
      id: conversationId,
      title: 'RHEL LightSpeed Chat',
      locked: false,
      createdAt: new Date(),
    };
  }

  /**
   * Get conversation history - always returns empty array
   * RAG system doesn't persist conversation history server-side
   */
  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<RHELLightspeedAdditionalProperties>> {
    return [];
  }

  /**
   * Health check endpoint
   */
  async healthCheck(options?: IRequestOptions): Promise<unknown> {
    try {
      return await this.makeRequest('/health', {
        method: 'GET',
        headers: options?.headers,
        signal: options?.signal,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get service status via metrics endpoint
   */
  async getServiceStatus(options?: IRequestOptions): Promise<unknown> {
    try {
      return await this.makeRequest('/metrics', {
        method: 'GET',
        headers: options?.headers,
        signal: options?.signal,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Make HTTP request to the RHEL LightSpeed API
   */
  private async makeRequest<T = unknown>(
    endpoint: string,
    options: RequestInit
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const response = await this.fetchFunction(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      
      if (response.status === 422) {
        throw new RHELLightspeedValidationError(
          errorBody?.detail?.[0]?.msg || 'Validation error',
          errorBody
        );
      }
      
      if (response.status >= 500) {
        throw new RHELLightspeedServerError(
          errorBody?.detail?.[0]?.msg || 'Server error',
          errorBody
        );
      }
      
      throw new AIClientError(
        response.status,
        response.statusText,
        errorBody?.detail?.[0]?.msg || `HTTP ${response.status}`,
        errorBody
      );
    }

    return response.json();
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: unknown): never {
    if (error instanceof AIClientError) {
      throw error;
    }
    
    if (error instanceof Error) {
      throw new AIClientError(0, 'Network Error', error.message, error);
    }
    
    throw new AIClientError(0, 'Unknown Error', 'An unknown error occurred', error);
  }
}