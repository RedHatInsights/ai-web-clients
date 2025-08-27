/**
 * Generic interface for custom fetch implementation that must be injected into AI clients.
 * Mirrors exactly the native browser fetch interface for maximum compatibility.
 */
export interface IFetchFunction {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Base configuration interface for all AI clients
 */
export interface IBaseClientConfig<TChunk = unknown> {
  /**
   * The base URL for the API
   */
  baseUrl: string;

  /**
   * Custom fetch implementation for making HTTP requests
   * Must include authentication headers (Bearer token) if needed
   */
  fetchFunction?: IFetchFunction;

  /**
   * Default streaming handler for the client
   * Used when sendMessage is called with stream=true but no streamingHandler provided
   * Individual requests can override this by providing their own streamingHandler
   */
  defaultStreamingHandler?: IStreamingHandler<TChunk>;
}

/**
 * Standard request options that can be passed to individual client methods
 */
export interface IRequestOptions {
  /**
   * Custom headers for this specific request
   */
  headers?: Record<string, string>;

  /**
   * AbortSignal to cancel the request
   */
  signal?: AbortSignal;
}

export interface IInitErrorResponse {
  message: string;
  status: number;
}

export function isInitErrorResponse(obj: unknown): obj is IInitErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'message' in obj &&
    typeof (obj as IInitErrorResponse).message === 'string' &&
    'status' in obj &&
    typeof (obj as IInitErrorResponse).status === 'number'
  );
}

export type ClientInitLimitation = {
  reason: string;
  detail?: string;
};

/**
 * Common interface that all AI clients must implement
 * Provides a standardized way to interact with different AI services
 */
declare class IAIClient<
  AP extends Record<string, unknown> = Record<string, unknown>,
  TChunk = unknown
> {
  constructor(config: IBaseClientConfig<TChunk>);
  /**
   * Initialize the client and return existing conversations
   * This method is called once when the client is first used by a state manager
   * @returns Promise that resolves to existing conversations and any limitations
   */
  init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
    error?: IInitErrorResponse;
  }>;

  /**
   * Send a message to the AI service
   * @param conversationId - The conversation ID to send the message to
   * @param message - The message content to send
   * @param options - Optional configuration for the request
   * @returns Promise that resolves to the AI's response
   */
  sendMessage<T extends Record<string, unknown> = Record<string, unknown>>(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions<T>
  ): Promise<IMessageResponse<AP>>;

  /**
   * Send a message to the AI service with custom request payload
   * @param conversationId - The conversation ID to send the message to
   * @param message - The message content to send
   * @param options - Optional configuration for the request with custom payload
   * @returns Promise that resolves to the AI's response
   */
  sendMessage<
    T extends Record<string, unknown> = Record<string, unknown>,
    R extends Record<string, unknown> = Record<string, unknown>
  >(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions<T, R>
  ): Promise<IMessageResponse<AP>>;

  /**
   * Get the default streaming handler for this client
   * All AI clients must implement this method to provide consistent streaming behavior
   * @returns The default streaming handler or undefined if not configured
   */
  getDefaultStreamingHandler<TChunk = unknown>():
    | IStreamingHandler<TChunk>
    | undefined;

  /**
   * Get the conversation history for a specific conversation
   * @param conversationId - The conversation ID to retrieve history for
   * @param options - Optional request configuration
   * @returns Promise that resolves to the conversation history
   */
  getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<AP>>;

  /**
   * Perform a health check on the AI service
   * @param options - Optional request configuration
   * @returns Promise that resolves to health status information
   */
  healthCheck(options?: IRequestOptions): Promise<unknown>;

  /**
   * Get the current status of the AI service
   * @param options - Optional request configuration
   * @returns Promise that resolves to service status information
   */
  getServiceStatus?(options?: IRequestOptions): Promise<unknown>;

  /**
   * Create a new conversation
   * @returns Promise that resolves to the newly created conversation
   */
  createNewConversation(): Promise<IConversation>;
}

export { IAIClient };

/**
 * Base error class for all AI client errors
 */
export class AIClientError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'AIClientError';
  }
}

/**
 * Validation error class for 422 responses
 */
export interface IValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export class AIClientValidationError extends AIClientError {
  constructor(public validationErrors: IValidationError[]) {
    super(
      422,
      'Validation Error',
      'Request validation failed',
      validationErrors
    );
    this.name = 'AIClientValidationError';
  }
}

/**
 * Common utility types used across AI clients
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Standard API response wrapper that many AI services use
 */
export interface IAPIResponse<T = unknown> {
  data?: T;
  error?: string;
  status?: number;
}

/**
 * Generic streaming handler interface for AI clients that support streaming
 */
export interface IStreamingHandler<TChunk = unknown> {
  /**
   * Handle a single chunk of streaming data
   */
  onChunk(chunk: TChunk, afterChunk?: (chunk: IStreamChunk) => void): void;

  /**
   * Called when the stream starts
   */
  onStart?(conversationId?: string, messageId?: string): void;

  /**
   * Called when the stream completes successfully
   */
  onComplete?(finalChunk: TChunk): void;

  /**
   * Called when an error occurs during streaming
   */
  onError?(error: Error): void;

  /**
   * Called when the stream is aborted
   */
  onAbort?(): void;
}

/**
 * Simplified streaming handler interface for cleaner implementation
 * This will eventually replace IStreamingHandler across all clients
 *
 * The simplified approach focuses on:
 * - Processing chunks and building message buffer
 * - Calling callback with current complete message
 * - Simple error handling
 */
declare class ISimpleStreamingHandler<TChunk = unknown> {
  /**
   * Process a chunk and return updated message buffer
   * @param chunk - The chunk data (text string or parsed JSON object)
   * @param currentBuffer - The current accumulated message content
   * @param handleChunk - Optional callback to execute with current complete message
   * @returns Updated message buffer after processing this chunk
   */
  processChunk(
    chunk: TChunk,
    currentBuffer: string,
    handleChunk?: HandleChunkCallback
  ): string;

  /**
   * Called when an error occurs during streaming
   */
  onError?(error: Error): void;
}

export { ISimpleStreamingHandler };

/**
 * Streaming request options for clients that support streaming
 */
export interface IStreamingRequestOptions<TChunk = unknown>
  extends IRequestOptions {
  /**
   * The streaming handler to process the response
   */
  streamingHandler: IStreamingHandler<TChunk>;
}

/**
 * Standard message response for non-streaming requests
 */
export interface IMessageResponse<
  AP extends Record<string, unknown> = Record<string, unknown>
> {
  /**
   * Unique identifier for the message
   */
  messageId: string;

  /**
   * The response answer/text
   */
  answer: string;

  /**
   * Conversation identifier this message belongs to
   */
  conversationId: string;

  /**
   * Timestamp when the message was created
   */
  date?: Date;
  /**
   * Additional attributes specific to the AI client
   */
  additionalAttributes?: AP;
}

/**
 * Source citation information for AI responses
 */
export interface IAnswerSource {
  /**
   * URL to the source content
   */
  link?: string | null;

  /**
   * Title of the source content
   */
  title?: string | null;

  /**
   * Relevance score of the source
   */
  score?: number | null;

  /**
   * Text snippet from the source
   */
  snippet?: string | null;
}

export interface IConversationMessage<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  message_id: string;
  answer: string;
  role: 'user' | 'bot';
  input: string; // For user messages, this is the input text
  additionalAttributes?: T;
  date: Date;
}

/**
 * Response type for conversation history requests
 */
export type IConversationHistoryResponse<
  T extends Record<string, unknown> = Record<string, unknown>
> = Omit<IConversationMessage<T>, 'role'>[] | null;

export interface IConversation {
  id: string;
  title: string;
  locked: boolean;
  createdAt: Date;
}

export interface IErrorMessageResponse {
  error: any;
}

export interface IStreamChunk<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  answer: string;
  messageId: string;
  conversationId: string;
  additionalAttributes: T;
}

export type AfterChunkCallback<
  T extends Record<string, unknown> = Record<string, unknown>
> = (chunk: IStreamChunk<T>) => void;

export type HandleChunkCallback<
  T extends Record<string, unknown> = Record<string, unknown>
> = (chunk: IStreamChunk<T>) => void;

/**
 * Options for sending messages, supporting both streaming and non-streaming modes
 */
export interface ISendMessageOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
  R extends Record<string, unknown> = never
> extends IRequestOptions {
  /**
   * Whether to use streaming mode for the response
   * When true, the client's default streaming handler will be used
   */
  stream?: boolean;
  afterChunk?: AfterChunkCallback<T>;
  /**
   * Additional request payload data specific to the client implementation
   * Only available when R is not 'never'
   */
  requestPayload?: R extends never ? never : R;
}
