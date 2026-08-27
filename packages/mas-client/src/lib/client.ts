import { MASClientConfig, RequestOptions } from './interfaces';
import {
  IAIClient,
  AIClientError,
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
  CreateSessionRequest,
  SubmitSessionRequest,
  SubmitSessionResponse,
  SessionChatResponse,
  SessionListItem,
  StreamStatusResponse,
  CancelSessionResponse,
  HealthCheckResponse,
  MASAdditionalAttributes,
} from './types';
import { DefaultStreamingHandler } from './default-streaming-handler';

/**
 * Multi-Agent System (MAS) API Client
 *
 * TypeScript client for the MAS session-based API with NDJSON streaming support.
 * Uses a predefined blueprintId to create sessions and interact with agent workflows.
 */
export class MASClient implements IAIClient<MASAdditionalAttributes> {
  private readonly baseUrl: string;
  private readonly fetchFunction: IFetchFunction;
  private readonly blueprintId: string;
  private readonly metadata?: Record<string, unknown>;
  private readonly hitlEnabled?: boolean;

  constructor(config: MASClientConfig) {
    this.baseUrl = config.baseUrl;
    this.blueprintId = config.blueprintId;
    this.metadata = config.metadata;
    this.hitlEnabled = config.hitlEnabled;
    this.fetchFunction =
      config.fetchFunction || ((input, init) => fetch(input, init));
  }

  private async makeRequest<T>(
    path: string,
    options: RequestInit & RequestOptions = {}
  ): Promise<T> {
    const { headers: customHeaders, signal, ...fetchOptions } = options;

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(customHeaders as Record<string, string>),
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

  private async handleErrorResponse(response: Response | null): Promise<never> {
    let errorData: unknown;
    try {
      if (response) {
        errorData = await response.json();
      } else {
        errorData = 'Unknown error';
      }
    } catch {
      errorData = response ? await response.text() : 'Unknown error';
    }

    const errorMessage =
      typeof errorData === 'object' &&
      errorData !== null &&
      'error' in errorData
        ? (errorData as { error: string }).error
        : 'Request failed';

    throw new AIClientError(
      response ? response.status : 500,
      response ? response.statusText : 'Internal Server Error',
      response
        ? `API request failed: ${response.status} - ${errorMessage}`
        : 'Network error occurred',
      errorData
    );
  }

  // --- IAIClient interface implementation ---

  async init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
  }> {
    try {
      await this.healthCheck();
      const sessions = await this.listSessions();

      const conversations: IConversation[] = sessions.map((session) => ({
        id: session.session_id,
        title:
          (session.metadata?.['title'] as string) ||
          `Session ${session.session_id.slice(0, 8)}`,
        locked: false,
        createdAt: new Date(session.started_at),
      }));

      return { conversations };
    } catch (error) {
      console.error('MAS Client initialization failed:', error);
      const errorResponse: IInitErrorResponse = {
        message:
          error instanceof AIClientError
            ? error.message
            : error instanceof Error
            ? error.message
            : 'Unknown error occurred',
        status: error instanceof AIClientError ? error.status : 500,
      };
      throw errorResponse;
    }
  }

  async createNewConversation(): Promise<IConversation> {
    const sessionId = await this.createSession({
      blueprintId: this.blueprintId,
      metadata: this.metadata,
      hitlEnabled: this.hitlEnabled,
    });

    return {
      id: sessionId,
      title: 'New Conversation',
      locked: false,
      createdAt: new Date(),
    };
  }

  async sendMessage(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions
  ): Promise<IMessageResponse<MASAdditionalAttributes>> {
    // Step 1: Submit the message (fire-and-forget, returns 202)
    await this.submitSession({
      sessionId: conversationId,
      inputs: { user_prompt: message },
      scope: 'public',
    });

    if (options?.stream) {
      // Step 2: Subscribe to NDJSON stream
      const subscribeUrl = `${this.baseUrl}/api/sessions/session.subscribe?sessionId=${conversationId}`;
      const response = await this.fetchFunction(subscribeUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/x-ndjson',
        },
        signal: options.signal,
      });

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new Error('Response body is null from subscribe endpoint');
      }

      const handleChunk = options?.handleChunk || (() => {});
      const handler = new DefaultStreamingHandler(
        response,
        conversationId,
        handleChunk,
        this.getChatState.bind(this)
      );

      return await handler.getResult();
    } else {
      // Non-streaming: poll for completion
      const chatState = await this.pollForCompletion(conversationId);

      return {
        messageId: conversationId,
        answer: chatState.output || '',
        conversationId,
        additionalAttributes: {
          output: chatState.output,
          status: chatState.status,
          status_message: chatState.status_message,
        },
      };
    }
  }

  async getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<MASAdditionalAttributes>> {
    const chatState = await this.getChatState(conversationId, options);

    if (!chatState.messages || chatState.messages.length === 0) {
      return null;
    }

    return chatState.messages.map((msg) => ({
      answer: msg.role === 'assistant' ? msg.content : '',
      input: msg.role === 'user' ? msg.content : '',
      message_id: conversationId,
      conversationId,
      date: new Date(),
      additionalAttributes: {
        output: chatState.output,
        status: chatState.status,
      },
    }));
  }

  async healthCheck(options?: RequestOptions): Promise<HealthCheckResponse> {
    return this.makeRequest<HealthCheckResponse>('/api/health/', {
      method: 'GET',
      ...options,
    });
  }

  async deleteConversation(sessionId: string): Promise<unknown> {
    return this.deleteSession(sessionId);
  }

  // --- MAS-specific methods ---

  async createSession(request: CreateSessionRequest): Promise<string> {
    return this.makeRequest<string>('/api/sessions/user.session.create', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async submitSession(
    request: SubmitSessionRequest
  ): Promise<SubmitSessionResponse> {
    return this.makeRequest<SubmitSessionResponse>(
      '/api/sessions/user.session.submit',
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  async getChatState(
    sessionId: string,
    options?: RequestOptions
  ): Promise<SessionChatResponse> {
    return this.makeRequest<SessionChatResponse>(
      `/api/sessions/session.chat.get?sessionId=${sessionId}`,
      {
        method: 'GET',
        ...options,
      }
    );
  }

  async listSessions(options?: RequestOptions): Promise<SessionListItem[]> {
    return this.makeRequest<SessionListItem[]>(
      '/api/sessions/session.user.list',
      {
        method: 'GET',
        ...options,
      }
    );
  }

  async deleteSession(
    sessionId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean }> {
    return this.makeRequest<{ success: boolean }>(
      `/api/sessions/session.delete?sessionId=${sessionId}`,
      {
        method: 'DELETE',
        ...options,
      }
    );
  }

  async cancelSession(
    sessionId: string,
    options?: RequestOptions
  ): Promise<CancelSessionResponse> {
    return this.makeRequest<CancelSessionResponse>(
      '/api/sessions/session.cancel',
      {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
        ...options,
      }
    );
  }

  async getStreamStatus(
    sessionId: string,
    options?: RequestOptions
  ): Promise<StreamStatusResponse> {
    return this.makeRequest<StreamStatusResponse>(
      `/api/sessions/session.stream.status?sessionId=${sessionId}`,
      {
        method: 'GET',
        ...options,
      }
    );
  }

  private async pollForCompletion(
    sessionId: string,
    intervalMs = 2000
  ): Promise<SessionChatResponse> {
    const terminalStatuses = ['COMPLETED', 'FAILED', 'CANCELLED'];

    while (true) {
      const chatState = await this.getChatState(sessionId);
      if (terminalStatuses.includes(chatState.status)) {
        return chatState;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
