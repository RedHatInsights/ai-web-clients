import { MessageChunkResponse } from './types';

/**
 * Interface for custom fetch implementation that must be injected into the client.
 * Mirrors exactly the native browser fetch interface.
 */
export interface IFetchFunction {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Interface for streaming message handler.
 * This must be implemented to handle the streaming responses from the message endpoint.
 */
export interface IStreamingHandler {
  /**
   * Handle a single chunk of streaming data
   * @param chunk - The parsed message chunk response
   */
  onChunk(chunk: MessageChunkResponse): void;

  /**
   * Called when the stream starts
   * @param conversationId - The ID of the conversation
   * @param messageId - The ID of the message being streamed
   */
  onStart?(conversationId: string, messageId: string): void;

  /**
   * Called when the stream completes successfully
   * @param finalChunk - The final complete message chunk
   */
  onComplete?(finalChunk: MessageChunkResponse): void;

  /**
   * Called when an error occurs during streaming
   * @param error - The error that occurred
   */
  onError?(error: Error): void;

  /**
   * Called when the stream is aborted
   */
  onAbort?(): void;
}

/**
 * Configuration options for the IFD client
 */
export interface IFDClientConfig {
  /**
   * The base URL for the IFD API
   */
  baseUrl: string;

  /**
   * Custom fetch implementation for making HTTP requests
   * Must include authentication headers (Bearer token) if needed
   */
  fetchFunction: IFetchFunction;
}

/**
 * Interface for request options that can be passed to individual methods
 */
export interface RequestOptions {
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
 * Interface for streaming request options
 */
export interface StreamingRequestOptions extends RequestOptions {
  /**
   * The streaming handler to process the response
   */
  streamingHandler: IStreamingHandler;
} 