import { AfterChunkCallback, IStreamingHandler } from '@redhat-cloud-services/ai-client-common';
import { MessageChunkResponse, IFDApiError, AnswerSource, IFDAdditionalAttributes } from './types';
import { 
  StreamingMessageChunk, 
  isEmpty, 
  isString, 
  isObject 
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
 * Process streaming response
 */
async function processStreamResponse(
  {
    response,
    conversationId,
    onChunk,
    onStart,
    onComplete,
    onError,
    afterChunk
  }: {
    response: Response;
    conversationId: string;
    onChunk: (message: MessageChunkResponse) => void;
    onStart?: (conversationId: string, messageId: string) => void;
    onComplete?: (finalChunk: MessageChunkResponse) => void;
    onError?: (error: Error) => void;
    afterChunk?: AfterChunkCallback<IFDAdditionalAttributes>;
  }
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new IFDApiError(500, 'Internal Server Error', 'No readable stream available');
  }

  if (response.body === null) {
    throw new IFDApiError(500, 'Internal Server Error', 'No response body received from server');
  }

  try {
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedAnswer = '';
    let messageId = '';
    let firstChunk = true;

    let done = false;
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      // Handle case where buffer holds a complete JSON (no newline in chunk)
      if (buffer && !isEmpty(buffer.trim()) && lines.length === 0 && isString(buffer)) {
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
                messageId = parsed.message_id;
              }
              
              // Call onStart if this is the first chunk (even if it's an error)
              if (firstChunk && onStart) {
                onStart(conversationId, messageId);
                firstChunk = false;
              }
              
              const errorChunk: MessageChunkResponse = {
                conversation_id: conversationId,
                message_id: messageId,
                answer: errorMessage,
                received_at: new Date().toISOString(),
                sources: [],
                tool_call_metadata: null,
                output_guard_result: null,
              };
              onError?.(new IFDApiError(parsed.status_code, 'Stream Error', errorMessage, parsed.detail));
              onChunk(errorChunk);
              afterChunk?.({
                answer: errorChunk.answer,
                additionalAttributes: {
                  sources: errorChunk.sources,
                  tool_call_metadata: errorChunk.tool_call_metadata,
                  output_guard_result: errorChunk.output_guard_result,
                }
              });
              onComplete?.(errorChunk);
              done = true;
              continue;
            }

            accumulatedAnswer += parsed.answer || '';
            
            // Store conversation and message IDs for callbacks
            if (parsed.message_id) {
              messageId = parsed.message_id;
            }

            // Create MessageChunkResponse format for the handler
            const chunkResponse: MessageChunkResponse = {
              conversation_id: conversationId,
              message_id: messageId,
              answer: accumulatedAnswer,
              received_at: parsed.created_at || new Date().toISOString(),
              sources: parsed.sources || [],
              tool_call_metadata: parsed.tool_call_metadata || null,
              output_guard_result: parsed.output_guard_result || null,
            };

            if (firstChunk && onStart) {
              onStart(conversationId, messageId);
              firstChunk = false;
            }

            onChunk(chunkResponse);
            afterChunk?.({
              answer: accumulatedAnswer,
              additionalAttributes: {
                sources: parsed.sources || [],
                tool_call_metadata: parsed.tool_call_metadata || null,
                output_guard_result: parsed.output_guard_result || null,
              }
            });
            if (parsed.end_of_stream) {
              onComplete?.(chunkResponse);
              done = true;
            }
          } catch (error) {
            console.error('Failed to parse JSON:', error);
            onError?.(error as Error);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type MessageBuffer = { answer: string; sources: AnswerSource[] };

/**
 * Default streaming handler implementation
 */
export class DefaultStreamingHandler implements IStreamingHandler<MessageChunkResponse> {
  private messageBuffer: MessageBuffer = {
    answer: '',
    sources: [],
  };
  private currentMessageId = '';
  private currentConversationId = '';

  onStart(conversationId: string, messageId: string): void {
    this.currentConversationId = conversationId;
    this.currentMessageId = messageId;
    this.messageBuffer = {
      answer: '',
      sources: [],
    };
  }

  onChunk(chunk: MessageChunkResponse): void {
    this.messageBuffer.answer = chunk.answer;
    this.messageBuffer.sources = chunk.sources;
  }

  onComplete(_finalChunk: MessageChunkResponse): void {
    // TBD
  }

  onError(error: Error): void {
    console.error(`Stream error:`, error);
  }

  onAbort(): void {
    // TBD
  }

  getCompleteMessage(): MessageBuffer {
    return this.messageBuffer;
  }

  getCurrentMessageId(): string {
    return this.currentMessageId;
  }

  getCurrentConversationId(): string {
    return this.currentConversationId;
  }
}

/**
 * Process stream with the streaming handler interface
 */
export async function processStreamWithHandler(
  response: Response,
  handler: IStreamingHandler<MessageChunkResponse>,
  conversationId: string,
  afterChunk?: AfterChunkCallback<IFDAdditionalAttributes>
): Promise<void> {
  await processStreamResponse({
    conversationId,
    response,
    onChunk: (message) => handler.onChunk(message),
    onStart: (conversationId, messageId) => handler.onStart?.(conversationId, messageId),
    onComplete: (finalChunk) => handler.onComplete?.(finalChunk),
    onError: (error) => handler.onError?.(error),
    afterChunk
  });
}
