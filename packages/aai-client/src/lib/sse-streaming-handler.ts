import {
  ISimpleStreamingHandler,
  HandleChunkCallback,
  IMessageResponse,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';
import { AAIAdditionalAttributes, AAISSEEvent } from './types';

/**
 * Self-contained streaming handler for AAI Server-Sent Events
 *
 * Processes streams internally and provides final result via getResult()
 */
export class AAIDefaultStreamingHandler
  implements ISimpleStreamingHandler<AAISSEEvent>
{
  private messageBuffer: IStreamChunk<AAIAdditionalAttributes> = {
    messageId: '',
    conversationId: '',
    answer: '',
    additionalAttributes: {},
  };
  private streamPromise: Promise<IMessageResponse<AAIAdditionalAttributes>>;

  constructor(
    private response: Response,
    private initialConversationId: string,
    private handleChunk: HandleChunkCallback<AAIAdditionalAttributes>
  ) {
    this.messageBuffer.conversationId = this.initialConversationId;
    // Start processing immediately and store the promise
    this.streamPromise = this.processStream();
  }

  /**
   * Get the final result (call this after stream completes)
   */
  async getResult(): Promise<IMessageResponse<AAIAdditionalAttributes>> {
    return this.streamPromise;
  }

  /**
   * Process a chunk and return updated message buffer
   * Updates internal state and calls handleChunk callback
   */
  processChunk(
    chunk: AAISSEEvent,
    currentBuffer: string,
    handleChunk: HandleChunkCallback<AAIAdditionalAttributes>
  ): string {
    let updatedBuffer = currentBuffer;

    switch (chunk.event) {
      case 'start':
        this.messageBuffer.conversationId = (chunk.data['conversation_id'] as string) || this.messageBuffer.conversationId;
        this.messageBuffer.messageId = crypto.randomUUID(); // Generate if not provided
        // Store start event in additional attributes
        this.messageBuffer.additionalAttributes.start_event = chunk.data;
        break;

      case 'token':
        // Only token events build the answer
        const token = this.extractString(chunk.data, 'token');
        if (token && chunk.data['role'] === 'inference') {
          this.messageBuffer.answer += token;
          updatedBuffer = this.messageBuffer.answer;
        }
        break;

      case 'tool_call':
        // Store tool call events
        if (!this.messageBuffer.additionalAttributes.tool_call_events) {
          this.messageBuffer.additionalAttributes.tool_call_events = [];
        }
        this.messageBuffer.additionalAttributes.tool_call_events.push(chunk.data);
        break;

      case 'turn_complete':
        // Use turn_complete token as final answer if available
        const completeToken = this.extractString(chunk.data, 'token');
        if (completeToken) {
          this.messageBuffer.answer = completeToken;
          updatedBuffer = this.messageBuffer.answer;
        }
        this.messageBuffer.additionalAttributes.turn_complete_event = chunk.data;
        break;

      case 'end':
        this.messageBuffer.additionalAttributes = {
          ...this.messageBuffer.additionalAttributes,
          end_event: chunk.data,
          referenced_documents: this.extractReferencedDocuments(chunk.data),
          input_tokens: this.extractNumber(chunk.data, 'input_tokens'),
          output_tokens: this.extractNumber(chunk.data, 'output_tokens'),
          available_quotas: this.extractRecord(chunk.data, 'available_quotas'),
        };
        break;

      case 'error':
        // Handle error events from the server
        const errorMessage = this.extractString(chunk.data, 'error') || 'Unknown streaming error';
        const errorStatus = this.extractNumber(chunk.data, 'status') || 500;
        throw new Error(`Streaming error: ${errorMessage} (status: ${errorStatus})`);
    }

    // Call the callback with current complete message
    const streamChunk: IStreamChunk<AAIAdditionalAttributes> = {
      messageId: this.messageBuffer.messageId,
      answer: this.messageBuffer.answer,
      conversationId: this.messageBuffer.conversationId,
      additionalAttributes: this.messageBuffer.additionalAttributes,
    };
    handleChunk(streamChunk);

    return updatedBuffer;
  }

  /**
   * Process the entire stream internally
   */
  private async processStream(): Promise<IMessageResponse<AAIAdditionalAttributes>> {
    if (!this.response.body) {
      throw new Error('Response body is null');
    }

    const reader = this.response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageBuffer = '';

    try {
      // Initialize message buffer
      this.messageBuffer = {
        messageId: '',
        conversationId: this.initialConversationId,
        answer: '',
        additionalAttributes: {
          start_event: {},
          tool_call_events: [],
        },
      };

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
              
              messageBuffer = this.processChunk(
                eventData,
                messageBuffer,
                this.handleChunk
              );
              
              if (eventData.event === 'end') {
                shouldContinue = false;
              }
            } catch (error) {
              // Always throw SSE parsing errors - if we can't parse JSON, we can't interpret messages
              throw new Error(`Failed to parse SSE data: ${line}. ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      }
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    } finally {
      reader.releaseLock();
    }

    // Return the final message response
    return {
      messageId: this.messageBuffer.messageId,
      answer: this.messageBuffer.answer,
      conversationId: this.messageBuffer.conversationId,
      additionalAttributes: this.messageBuffer.additionalAttributes,
    };
  }

  /**
   * Called when an error occurs during streaming
   */
  onError?(error: Error): void {
    console.error('AAI SSE Stream error:', error);
  }

  /**
   * Safely extract referenced documents from chunk data
   */
  private extractReferencedDocuments(data: Record<string, unknown>): Array<{doc_url: string; doc_title: string}> | undefined {
    const docs = data['referenced_documents'];
    if (Array.isArray(docs)) {
      return docs.filter(doc => 
        doc && typeof doc === 'object' && 
        'doc_url' in doc && 'doc_title' in doc &&
        typeof doc.doc_url === 'string' && typeof doc.doc_title === 'string'
      );
    }
    return undefined;
  }

  /**
   * Safely extract a number from chunk data
   */
  private extractNumber(data: Record<string, unknown>, key: string): number | undefined {
    const value = data[key];
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Safely extract a string from chunk data
   */
  private extractString(data: Record<string, unknown>, key: string): string | undefined {
    const value = data[key];
    return typeof value === 'string' ? value : undefined;
  }

  /**
   * Safely extract a record from chunk data
   */
  private extractRecord(data: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = data[key];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  }
}