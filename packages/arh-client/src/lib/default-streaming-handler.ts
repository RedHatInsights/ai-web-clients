import {
  HandleChunkCallback,
  ISimpleStreamingHandler,
  IMessageResponse,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';
import {
  MessageChunkResponse,
  IFDApiError,
  IFDAdditionalAttributes,
  MessageQuotaStatus,
  QuotaStatusResponse,
} from './types';
import {
  StreamingMessageChunk,
  isEmpty,
  isString,
  isObject,
} from './streaming-types';

/**
 * Extract error message from various formats
 */
function extractErrorMessage(detail: unknown): string {
  if (isEmpty(detail)) {
    return 'Something went wrong. Please try again later.';
  }

  if (isString(detail)) {
    return detail.trim() || 'Something went wrong. Please try again later.';
  }

  if (isObject(detail)) {
    const message = (detail as Record<string, unknown>)?.['message'];
    if (isString(message)) {
      return message.trim() || 'Something went wrong. Please try again later.';
    }

    try {
      return JSON.stringify(detail, null, 2);
    } catch {
      return 'An unknown error occurred.';
    }
  }

  return 'Something went wrong. Please try again later.';
}

/**
 * Clean and parse a streaming line
 */
function cleanAndParseLine(line: string): StreamingMessageChunk | null {
  let cleaned = line.trim();

  // Find first `{` and slice from there (native JS replacement for lodash)
  const jsonStartIndex = cleaned.indexOf('{');
  if (jsonStartIndex > 0) {
    cleaned = cleaned.slice(jsonStartIndex);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Self-contained streaming handler for ARH API responses
 *
 * Processes streams internally and provides final result via getResult()
 */
export class DefaultStreamingHandler
  implements ISimpleStreamingHandler<MessageChunkResponse>
{
  private conversationId = '';
  private additionalAttributes: IFDAdditionalAttributes = {
    sources: [],
    tool_call_metadata: null,
    output_guard_result: null,
  };
  private messageBuffer = '';
  private messageId = '';
  private streamPromise: Promise<IMessageResponse<IFDAdditionalAttributes>>;

  constructor(
    private response: Response,
    private initialConversationId: string,
    private handleChunk: HandleChunkCallback<IFDAdditionalAttributes>,
    private getQuota: (
      conversationId: string
    ) => Promise<QuotaStatusResponse<MessageQuotaStatus>>
  ) {
    this.conversationId = this.initialConversationId;
    // Start processing immediately and store the promise
    this.streamPromise = this.processStream();
  }

  /**
   * Process the entire stream internally
   */
  private async processStream(): Promise<
    IMessageResponse<IFDAdditionalAttributes>
  > {
    if (!this.response.body) {
      throw new IFDApiError(
        500,
        'Internal Server Error',
        'No readable stream available'
      );
    }

    const reader = this.response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      let buffer = '';
      let accumulatedAnswer = '';

      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        // Handle case where buffer holds a complete JSON (no newline in chunk)
        if (
          buffer &&
          !isEmpty(buffer.trim()) &&
          lines.length === 0 &&
          isString(buffer)
        ) {
          lines.push(buffer);
        }

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = cleanAndParseLine(line);
              if (!parsed || isEmpty(parsed)) {
                continue;
              }

              // Handle error responses
              if (parsed.status_code && parsed.detail) {
                const errorMessage = extractErrorMessage(parsed.detail);

                // Ensure messageId is set for error chunks
                if (parsed.message_id) {
                  this.messageId = parsed.message_id;
                }

                const errorChunk: MessageChunkResponse = {
                  conversation_id: this.conversationId,
                  message_id: this.messageId,
                  answer: errorMessage,
                  received_at: new Date().toISOString(),
                  sources: [],
                  tool_call_metadata: null,
                  output_guard_result: null,
                };

                this.onError?.(
                  new IFDApiError(
                    parsed.status_code,
                    'Stream Error',
                    errorMessage,
                    parsed.detail
                  )
                );

                // Process the error chunk and call handleChunk
                this.messageBuffer = this.processChunk(
                  errorChunk,
                  this.messageBuffer,
                  this.handleChunk
                );

                done = true;
                continue;
              }

              accumulatedAnswer += parsed.answer || '';

              // Store conversation and message IDs for callbacks
              if (parsed.message_id) {
                this.messageId = parsed.message_id;
              }

              // Create MessageChunkResponse format for the handler
              const chunkResponse: MessageChunkResponse = {
                conversation_id: this.conversationId,
                message_id: this.messageId,
                answer: accumulatedAnswer,
                received_at: parsed.created_at || new Date().toISOString(),
                sources: parsed.sources || [],
                tool_call_metadata: parsed.tool_call_metadata || null,
                output_guard_result: parsed.output_guard_result || null,
              };

              // Process the chunk and call handleChunk
              this.messageBuffer = this.processChunk(
                chunkResponse,
                this.messageBuffer,
                this.handleChunk
              );

              if (parsed.end_of_stream) {
                try {
                  const quota = await this.getQuota(this.conversationId);
                  this.additionalAttributes.quota = quota;
                  this.handleChunk({
                    answer: accumulatedAnswer,
                    messageId: this.messageId,
                    conversationId: this.conversationId,
                    additionalAttributes: {
                      sources: parsed.sources || [],
                      tool_call_metadata: parsed.tool_call_metadata || null,
                      output_guard_result: parsed.output_guard_result || null,
                      quota,
                    },
                  });
                } catch (error) {
                  // silently ignore quota errors
                  console.error('Failed to fetch quota:', error);
                }
                done = true;
              }
            } catch (error) {
              console.error('Failed to parse JSON:', error);
              this.onError?.(error as Error);
            }
          }
        }
      }

      return {
        messageId: this.messageId,
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
  async getResult(): Promise<IMessageResponse<IFDAdditionalAttributes>> {
    return this.streamPromise;
  }

  /**
   * Process a chunk and return updated message buffer
   * Updates internal state and calls handleChunk callback
   */
  processChunk(
    chunk: MessageChunkResponse,
    _currentBuffer: string,
    handleChunk: HandleChunkCallback<IFDAdditionalAttributes>
  ): string {
    const updatedBuffer = chunk.answer;

    // Update internal state
    this.additionalAttributes = {
      sources: chunk.sources,
      tool_call_metadata: chunk.tool_call_metadata,
      output_guard_result: chunk.output_guard_result,
      quota: this.additionalAttributes.quota, // preserve existing quota if any
    };

    // Call the callback with current complete message
    const streamChunk: IStreamChunk<IFDAdditionalAttributes> = {
      messageId: this.messageId,
      answer: updatedBuffer,
      conversationId: this.conversationId,
      additionalAttributes: this.additionalAttributes,
    };
    handleChunk(streamChunk);

    return updatedBuffer;
  }

  /**
   * Called when an error occurs during streaming
   */
  onError?(error: Error): void {
    console.error('ARH streaming error:', error);
  }
}
