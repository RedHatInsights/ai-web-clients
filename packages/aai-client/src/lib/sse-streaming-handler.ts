import {
  IStreamingHandler,
  AfterChunkCallback,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';
import { AAIAdditionalAttributes, AAISSEEvent } from './types';

/**
 * Default streaming handler for AAI Server-Sent Events
 */
export class AAIDefaultStreamingHandler implements IStreamingHandler<AAISSEEvent> {

  private messageBuffer: IStreamChunk<AAIAdditionalAttributes> = {
    messageId: '',
    conversationId: '',
    answer: '',
    additionalAttributes: {
    },
  };

  constructor(
    private afterChunk?: AfterChunkCallback<Record<string, unknown>>
  ) {}

  onStart?(conversationId?: string, messageId?: string): void {
    this.messageBuffer.conversationId = conversationId || '';
    this.messageBuffer.messageId = messageId || '';
    this.messageBuffer.answer = '';
    this.messageBuffer.additionalAttributes = {
      start_event: {},
      tool_call_events: [],
    };
  }

  onChunk(chunk: AAISSEEvent, afterChunk?: AfterChunkCallback<Record<string, unknown>>): void {
    const callback = afterChunk || this.afterChunk;

    switch (chunk.event) {
      case 'start':
        this.messageBuffer.conversationId = (chunk.data['conversation_id'] as string) || this.messageBuffer.conversationId;
        this.messageBuffer.messageId = crypto.randomUUID(); // Generate if not provided
        // Store start event in additional attributes
        this.messageBuffer.additionalAttributes.start_event = chunk.data;
        callback?.({
          ...this.messageBuffer
        });
        break;

      case 'token':
        // Only token events build the answer
        const token = chunk.data['token'] as string;
        if (token && chunk.data['role'] === 'inference') {
          this.messageBuffer.answer += token;
        }
        callback?.({
          ...this.messageBuffer
        });
        break;

      case 'tool_call':
        // not needed for now
        break;
      case 'turn_complete':
        // Use turn_complete token as final answer if available
        const completeToken = chunk.data['token'] as string;
        if (completeToken) {
          this.messageBuffer.answer = completeToken;
        }
        this.messageBuffer.additionalAttributes.turn_complete_event = chunk.data;
        callback?.({
          ...this.messageBuffer
        });
        break;

      case 'end':
        this.messageBuffer.additionalAttributes = {
          end_event: chunk.data,
          referenced_documents: chunk.data['referenced_documents'],
          input_tokens: chunk.data['input_tokens'],
          output_tokens: chunk.data['output_tokens'],
          available_quotas: chunk.data['available_quotas'],
        };
        // End event metadata goes into additional attributes
        callback?.({
          ...this.messageBuffer
        });
        break;

      case 'error':
        // Handle error events from the server
        const errorMessage = chunk.data['error'] as string || 'Unknown streaming error';
        const errorStatus = chunk.data['status'] as number || 500;
        throw new Error(`Streaming error: ${errorMessage} (status: ${errorStatus})`);
    }
  }

  onComplete() {
    return this.messageBuffer;
  }

  onError?(error: Error): void {
    console.error('SSE Stream error:', error);
  }

  onAbort?(): void {
    // Stream was aborted
  }

  getMessageBuffer(): IStreamChunk<AAIAdditionalAttributes> {
    return this.messageBuffer;
  }
}

/**
 * Parse Server-Sent Events from a ReadableStream
 */
export async function parseSSEStream(
  response: Response,
  handler: IStreamingHandler<AAISSEEvent>
): Promise<IStreamChunk<AAIAdditionalAttributes>> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let finalMessage: IStreamChunk<AAIAdditionalAttributes>
  try {
    handler.onStart?.();

    let shouldContinue = true;
    while (shouldContinue) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = line.replace(/^data: /, ''); // Remove 'data: ' prefix
            const eventData = JSON.parse(jsonData) as AAISSEEvent;
            handler.onChunk(eventData);
            
            if (eventData.event === 'end') {
              handler.onComplete?.(eventData);
              shouldContinue = false;
            }
          } catch (error) {
            // Always throw SSE parsing errors - if we can't parse JSON, we can't interpret messages
            throw new Error(`Failed to parse SSE data: ${line}. ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    if (handler instanceof AAIDefaultStreamingHandler) {
      finalMessage = handler.getMessageBuffer();
    } else {
      throw new Error('Unknown streaming handler');
    }
    return finalMessage;
  } catch (error) {
    handler.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    reader.releaseLock();
  }
}