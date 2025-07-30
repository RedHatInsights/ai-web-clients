import { AfterChunkCallback, IStreamingHandler } from '@redhat-cloud-services/ai-client-common';
import { LightSpeedCoreAdditionalProperties, MessageChunkResponse } from './types';

/**
 * Default streaming handler for Lightspeed API responses
 * 
 * This handler processes Server-Sent Events (SSE) from the Lightspeed streaming endpoint.
 * It follows the workspace pattern of providing sensible defaults while allowing customization.
 */
export class DefaultStreamingHandler implements IStreamingHandler<MessageChunkResponse> {
  
  /**
   * Handle a single chunk of streaming data from Lightspeed
   * @param chunk - The message chunk from the stream
   * @param afterChunk - Optional callback to execute after processing the chunk
   */
  onChunk(chunk: MessageChunkResponse, afterChunk?: AfterChunkCallback<LightSpeedCoreAdditionalProperties>) {
    // Process the chunk (could be logged, stored, etc.)
    if (chunk.answer) {
      // Basic handling - in a real implementation, this might update UI, etc.
    }
    
    if (chunk.error) {
      console.error('Streaming error:', chunk.error);
    }
    
    // Call the optional callback
    if (afterChunk) {
      afterChunk({
        additionalAttributes: {},
        answer: chunk.answer ?? '',
      });
    }
  }
  
  /**
   * Called when the stream starts
   * @param conversationId - Optional conversation ID
   * @param messageId - Optional message ID  
   */
  onStart?(): void {
  }
  
  /**
   * Called when the stream completes successfully
   * @param finalChunk - The final chunk received
   */
  onComplete?(): void {
  }
  
  /**
   * Called when an error occurs during streaming
   * @param error - The error that occurred
   */
  onError?(error: Error): void {
    console.error('Streaming error:', error);
  }
  
  /**
   * Called when the stream is aborted
   */
  onAbort?(): void {
  }
}

/**
 * Process a streaming response with a given handler
 * 
 * @param response - The fetch Response object containing the stream
 * @param handler - The streaming handler to process chunks
 * @param afterChunk - Optional callback to execute after each chunk
 * @returns Promise that resolves when the stream is complete
 */
export async function processStreamWithHandler(
  response: Response,
  handler: IStreamingHandler<MessageChunkResponse>,
  afterChunk?: AfterChunkCallback<LightSpeedCoreAdditionalProperties>
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is not available for streaming');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    // Call onStart if available
    if (handler.onStart) {
      handler.onStart();
    }

    let fullMessage = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // Decode the chunk as plain text
      const textChunk = decoder.decode(value, { stream: true });
      fullMessage += textChunk;

      // Create a chunk response for this text piece
      const chunkResponse: MessageChunkResponse = {
        answer: fullMessage, // Send the accumulated message so far
        finished: false,
        conversation_id: undefined // Will be set by state manager
      };

      // Process the chunk with the handler
      handler.onChunk(chunkResponse, afterChunk);
    }

    // Create and send the final chunk with finished: true
    if (fullMessage) {
      const finalChunk: MessageChunkResponse = {
        answer: fullMessage,
        finished: true,
        conversation_id: undefined // Will be set by state manager
      };

      // Process the final chunk
      handler.onChunk(finalChunk, afterChunk);

      // Call onComplete if available
      if (handler.onComplete) {
        handler.onComplete(finalChunk);
      }
    }

  } catch (error) {
    // Call onError if available
    if (handler.onError) {
      handler.onError(error as Error);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
} 