import {
  HandleChunkCallback,
  ISimpleStreamingHandler,
  IMessageResponse,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';
import {
  LightSpeedCoreAdditionalProperties,
  StreamingEvent,
  isTokenEvent,
  isStartEvent,
  isEndEvent,
  isAssistantAnswerEvent,
  isErrorEvent,
} from './types';

/**
 * Simplified streaming handler for Lightspeed API responses
 *
 * Self-contained handler that processes streams internally.
 * Supports dual media types:
 * - text/plain: Simple text accumulation
 * - application/json: JSON Server-Sent Events with comprehensive event types
 */
export class DefaultStreamingHandler
  implements ISimpleStreamingHandler<string | StreamingEvent>
{
  private conversationId = '';
  private additionalAttributes: LightSpeedCoreAdditionalProperties = {};
  private messageBuffer = '';
  private streamPromise: Promise<
    IMessageResponse<LightSpeedCoreAdditionalProperties>
  >;

  constructor(
    private response: Response,
    private initialConversationId: string,
    private mediaType: 'text/plain' | 'application/json',
    private handleChunk: HandleChunkCallback<LightSpeedCoreAdditionalProperties>
  ) {
    // Start processing immediately and store the promise
    this.streamPromise = this.processStream();
  }

  /**
   * Process the entire stream internally
   */
  private async processStream(): Promise<
    IMessageResponse<LightSpeedCoreAdditionalProperties>
  > {
    if (!this.response.body) {
      throw new Error('Response body is not available for streaming');
    }

    const reader = this.response.body.getReader();
    const decoder = new TextDecoder();
    this.conversationId = this.initialConversationId;

    try {
      if (this.mediaType === 'application/json') {
        // Process JSON Server-Sent Events
        let textBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });
          const lines = textBuffer.split('\n');
          textBuffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));
                this.messageBuffer = this.processChunk(
                  eventData,
                  this.messageBuffer,
                  this.handleChunk
                );
              } catch (error) {
                console.warn('Failed to parse JSON event:', line, error);
              }
            }
          }
        }
      } else {
        // Process text/plain streaming
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value, { stream: true });
          this.messageBuffer = this.processChunk(
            textChunk,
            this.messageBuffer,
            this.handleChunk
          );
        }
      }

      return {
        messageId: crypto.randomUUID(),
        answer: this.messageBuffer,
        conversationId: this.conversationId,
        additionalAttributes: this.additionalAttributes,
      };
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get the final result (call this after stream completes)
   */
  async getResult(): Promise<
    IMessageResponse<LightSpeedCoreAdditionalProperties>
  > {
    return this.streamPromise;
  }

  /**
   * Process a chunk and return updated message buffer
   * Supports both text/plain and JSON SSE formats
   */
  processChunk(
    chunk: string | StreamingEvent,
    currentBuffer: string,
    handleChunk: HandleChunkCallback<LightSpeedCoreAdditionalProperties>
  ): string {
    let updatedBuffer = currentBuffer;
    let hasUpdate = false;

    if (typeof chunk === 'string') {
      // Text/plain mode - simple accumulation
      updatedBuffer = currentBuffer + chunk;
      hasUpdate = true;
    } else {
      // JSON mode - parse streaming events
      const result = this.processJsonEvent(chunk, currentBuffer);
      updatedBuffer = result.buffer;
      hasUpdate = result.hasUpdate;

      // Update conversation metadata
      if (result.conversationId) {
        this.conversationId = result.conversationId;
      }
      if (result.additionalAttributes) {
        Object.assign(this.additionalAttributes, result.additionalAttributes);
      }
    }

    // Call the callback with current complete message if there's an update
    if (hasUpdate && updatedBuffer) {
      const streamChunk: IStreamChunk<LightSpeedCoreAdditionalProperties> = {
        messageId: crypto.randomUUID(),
        answer: updatedBuffer,
        conversationId: this.conversationId,
        additionalAttributes: this.additionalAttributes,
      };
      handleChunk(streamChunk);
    }

    return updatedBuffer;
  }

  /**
   * Process a JSON streaming event and extract relevant data
   */
  private processJsonEvent(
    event: StreamingEvent,
    currentBuffer: string
  ): {
    buffer: string;
    hasUpdate: boolean;
    conversationId?: string;
    additionalAttributes?: LightSpeedCoreAdditionalProperties;
  } {
    let buffer = currentBuffer;
    let hasUpdate = false;
    let conversationId: string | undefined;
    let additionalAttributes: LightSpeedCoreAdditionalProperties | undefined;

    // Focus on answer-building events
    if (isTokenEvent(event)) {
      // Accumulate tokens
      buffer += event.data.token;
      hasUpdate = true;
    } else if (isAssistantAnswerEvent(event)) {
      // Complete answer overrides token accumulation
      buffer = event.answer;
      conversationId = event.conversation_id;
      hasUpdate = true;
    } else if (isStartEvent(event)) {
      // Capture conversation ID
      conversationId = event.data.conversation_id;
    } else if (isEndEvent(event)) {
      // Capture final metadata
      additionalAttributes = {
        referencedDocuments: event.data.referenced_documents,
        truncated: event.data.truncated,
        inputTokens: event.data.input_tokens,
        outputTokens: event.data.output_tokens,
        availableQuotas: event.available_quotas as Record<string, number>,
      };
    } else if (isErrorEvent(event)) {
      // Handle error events
      const error = new Error(event.data.response);
      this.onError?.(error);
      throw error;
    }
    // Ignore other events (tool_call, tool_result, user_question) for now

    return { buffer, hasUpdate, conversationId, additionalAttributes };
  }

  /**
   * Called when an error occurs during streaming
   */
  onError?(error: Error): void {
    console.error('Lightspeed streaming error:', error);
  }
}
