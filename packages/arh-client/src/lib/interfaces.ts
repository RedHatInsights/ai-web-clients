import { MessageChunkResponse } from './types';
import { 
  IBaseClientConfig,
  IRequestOptions,
  IStreamingHandler as ICommonStreamingHandler
} from '@redhat-cloud-services/ai-client-common';

/**
 * Configuration options for the IFD client
 * Extends the base client config with ARH-specific streaming handler
 */
export interface IFDClientConfig extends IBaseClientConfig<MessageChunkResponse> {
  // Inherits baseUrl, fetchFunction, and defaultStreamingHandler from IBaseClientConfig
}

/**
 * ARH-specific request options that extend the base request options
 */
export interface RequestOptions extends IRequestOptions {
  // Inherits headers and signal from IRequestOptions
}

/**
 * Legacy interface - kept for backward compatibility but deprecated
 * Use IStreamingHandler<MessageChunkResponse> from ai-client-common instead
 * @deprecated Use IStreamingHandler<MessageChunkResponse> from ai-client-common
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
 * Legacy streaming request options - kept for backward compatibility but deprecated
 * @deprecated Use ISendMessageOptions with stream: true from ai-client-common instead
 */
export interface StreamingRequestOptions extends RequestOptions {
  /**
   * The streaming handler to process the response
   * @deprecated Streaming handlers should be configured at client level via defaultStreamingHandler
   */
  streamingHandler: IStreamingHandler;
}

// Re-export commonly used interfaces from ai-client-common for convenience
export { 
  IFetchFunction,
  IBaseClientConfig,
  IRequestOptions
} from '@redhat-cloud-services/ai-client-common';

// Export the common streaming handler with a clear name
export { ICommonStreamingHandler }; 