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
  fetchFunction: IFetchFunction;

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

/**
 * Generic AI Client interface that all specific clients should implement
 * This establishes the common patterns for API clients in our workspace
 */
export interface IAIClient {
  /**
   * Send a message to the AI service
   * Supports both streaming and non-streaming modes based on options.stream
   * 
   * For streaming mode (stream: true):
   * - If streamingHandler is provided in options, it will be used
   * - If no streamingHandler in options, the client's defaultStreamingHandler will be used
   * - If neither is available, an error should be thrown
   * 
   * @param conversationId - Unique identifier for the conversation
   * @param message - The message content to send
   * @param options - Optional configuration including streaming mode
   * @returns Promise that resolves to IMessageResponse for non-streaming, or void for streaming
   */
  sendMessage(
    conversationId: string, 
    message: string, 
    options?: ISendMessageOptions
  ): Promise<IMessageResponse | void>;

  /**
   * Get the default streaming handler configured for this client
   * Returns undefined if no default handler is configured
   * Useful for state managers that need to wrap the default handler
   * 
   * @returns The default streaming handler or undefined
   */
  getDefaultStreamingHandler?<TChunk = unknown>(): IStreamingHandler<TChunk> | undefined;

  /**
   * Health check endpoint - all AI services should provide this
   */
  healthCheck(options?: IRequestOptions): Promise<unknown>;

  /**
   * Service status endpoint - all AI services should provide this for monitoring
   */
  getServiceStatus?(options?: IRequestOptions): Promise<unknown>;
}

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
    super(422, 'Validation Error', 'Request validation failed', validationErrors);
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
  onChunk(chunk: TChunk): void;

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
 * Streaming request options for clients that support streaming
 */
export interface IStreamingRequestOptions<TChunk = unknown> extends IRequestOptions {
  /**
   * The streaming handler to process the response
   */
  streamingHandler: IStreamingHandler<TChunk>;
}

/**
 * Standard message response for non-streaming requests
 */
export interface IMessageResponse {
  /**
   * Unique identifier for the message
   */
  messageId: string;
  
  /**
   * The response content/text
   */
  content: string;
  
  /**
   * Conversation identifier this message belongs to
   */
  conversationId: string;
  
  /**
   * Timestamp when the message was created
   */
  createdAt?: string;
  
  /**
   * Additional metadata about the response
   */
  metadata?: Record<string, unknown>;
}

/**
 * Options for sending messages, supporting both streaming and non-streaming modes
 */
export interface ISendMessageOptions extends IRequestOptions {
  /**
   * Whether to use streaming mode for the response
   * When true, the client's default streaming handler will be used
   */
  stream?: boolean;
}

/**
 * Partial streaming handler interface for hooking into specific events
 * Allows state managers and other components to intercept streaming events
 */
export interface IStreamingHandlerHooks<TChunk = unknown> {
  /**
   * Called before the original onChunk handler
   * Can be used for state updates, logging, etc.
   */
  beforeChunk?: (chunk: TChunk) => void;
  
  /**
   * Called after the original onChunk handler
   */
  afterChunk?: (chunk: TChunk) => void;
  
  /**
   * Called before the original onStart handler
   */
  beforeStart?: (conversationId?: string, messageId?: string) => void;
  
  /**
   * Called after the original onStart handler
   */
  afterStart?: (conversationId?: string, messageId?: string) => void;
  
  /**
   * Called before the original onComplete handler
   */
  beforeComplete?: (finalChunk: TChunk) => void;
  
  /**
   * Called after the original onComplete handler
   */
  afterComplete?: (finalChunk: TChunk) => void;
  
  /**
   * Called before the original onError handler
   */
  beforeError?: (error: Error) => void;
  
  /**
   * Called after the original onError handler
   */
  afterError?: (error: Error) => void;
  
  /**
   * Called before the original onAbort handler
   */
  beforeAbort?: () => void;
  
  /**
   * Called after the original onAbort handler
   */
  afterAbort?: () => void;
}

/**
 * Wraps an existing streaming handler with additional hooks
 * Useful for state managers that need to intercept streaming events
 * while preserving the original handler's behavior
 * 
 * @param originalHandler - The original streaming handler to wrap
 * @param hooks - Additional hooks to call before/after the original handler methods
 * @returns A new streaming handler that calls both the hooks and original handler
 */
export function wrapStreamingHandler<TChunk = unknown>(
  originalHandler: IStreamingHandler<TChunk>,
  hooks: IStreamingHandlerHooks<TChunk>
): IStreamingHandler<TChunk> {
  return {
    onChunk: (chunk: TChunk) => {
      hooks.beforeChunk?.(chunk);
      originalHandler.onChunk(chunk);
      hooks.afterChunk?.(chunk);
    },
    
    onStart: (conversationId?: string, messageId?: string) => {
      hooks.beforeStart?.(conversationId, messageId);
      originalHandler.onStart?.(conversationId, messageId);
      hooks.afterStart?.(conversationId, messageId);
    },
    
    onComplete: (finalChunk: TChunk) => {
      hooks.beforeComplete?.(finalChunk);
      originalHandler.onComplete?.(finalChunk);
      hooks.afterComplete?.(finalChunk);
    },
    
    onError: (error: Error) => {
      hooks.beforeError?.(error);
      originalHandler.onError?.(error);
      hooks.afterError?.(error);
    },
    
    onAbort: () => {
      hooks.beforeAbort?.();
      originalHandler.onAbort?.();
      hooks.afterAbort?.();
    }
  };
}

/**
 * Creates a streaming handler that calls multiple handlers in sequence
 * Useful when you need multiple components to react to streaming events
 * 
 * @param handlers - Array of streaming handlers to compose
 * @returns A new streaming handler that calls all provided handlers
 */
export function composeStreamingHandlers<TChunk = unknown>(
  ...handlers: IStreamingHandler<TChunk>[]
): IStreamingHandler<TChunk> {
  return {
    onChunk: (chunk: TChunk) => {
      handlers.forEach(handler => handler.onChunk(chunk));
    },
    
    onStart: (conversationId?: string, messageId?: string) => {
      handlers.forEach(handler => handler.onStart?.(conversationId, messageId));
    },
    
    onComplete: (finalChunk: TChunk) => {
      handlers.forEach(handler => handler.onComplete?.(finalChunk));
    },
    
    onError: (error: Error) => {
      handlers.forEach(handler => handler.onError?.(error));
    },
    
    onAbort: () => {
      handlers.forEach(handler => handler.onAbort?.());
    }
  };
}
