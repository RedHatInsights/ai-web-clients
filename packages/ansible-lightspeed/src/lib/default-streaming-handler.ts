import {
  HandleChunkCallback,
  ISimpleStreamingHandler,
  IMessageResponse,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';
import {
  isEndEvent,
  isTokenEvent,
  MessageEvent,
  StreamingEvent,
} from './streaming-types';
import { AnsibleLightspeedMessageAttributes } from './types';

/**
 * Self-contained streaming handler for processing Server-Sent Events from Ansible Lightspeed API
 *
 * Processes streams internally and provides final result via getResult()
 */
export class DefaultStreamingHandler
  implements ISimpleStreamingHandler<StreamingEvent>
{
  private messageBuffer: MessageEvent = {
    data: {
      id: 0,
      role: '',
      token: '',
      referenced_documents: [],
      truncated: false,
      input_tokens: 0,
      output_tokens: 0,
      available_quotas: {},
    },
    event: 'message',
  };
  private conversationId = '';
  private streamPromise: Promise<
    IMessageResponse<AnsibleLightspeedMessageAttributes>
  >;

  constructor(
    private response: Response,
    private initialConversationId: string,
    private handleChunk: HandleChunkCallback<AnsibleLightspeedMessageAttributes>
  ) {
    this.conversationId = this.initialConversationId;
    // Start processing immediately and store the promise
    this.streamPromise = this.processStream();
  }

  /**
   * Get the final result (call this after stream completes)
   */
  async getResult(): Promise<
    IMessageResponse<AnsibleLightspeedMessageAttributes>
  > {
    return this.streamPromise;
  }

  /**
   * Process a chunk and return updated message buffer
   * Updates internal state and calls handleChunk callback
   */
  processChunk(
    chunk: StreamingEvent,
    currentBuffer: string,
    handleChunk: HandleChunkCallback<AnsibleLightspeedMessageAttributes>
  ): string {
    let updatedBuffer = currentBuffer;

    if (isTokenEvent(chunk)) {
      this.messageBuffer.data.id = chunk.data.id;
      this.messageBuffer.data.role = chunk.data.role;
      this.messageBuffer.data.token += chunk.data.token;
      updatedBuffer = this.messageBuffer.data.token;
    }

    if (isEndEvent(chunk)) {
      this.messageBuffer.data.referenced_documents =
        chunk.data.referenced_documents || [];
      this.messageBuffer.data.truncated = chunk.data.truncated || false;
      this.messageBuffer.data.input_tokens = chunk.data.input_tokens || 0;
      this.messageBuffer.data.output_tokens = chunk.data.output_tokens || 0;
      this.messageBuffer.data.available_quotas =
        chunk.data.available_quotas || {};
    }

    // Call the callback with current complete message
    if (updatedBuffer) {
      const streamChunk: IStreamChunk<AnsibleLightspeedMessageAttributes> = {
        messageId: this.messageBuffer.data.id.toString(),
        answer: this.messageBuffer.data.token,
        conversationId: this.conversationId,
        additionalAttributes: {
          referenced_documents: this.messageBuffer.data.referenced_documents,
          truncated: this.messageBuffer.data.truncated,
          input_tokens: this.messageBuffer.data.input_tokens,
          output_tokens: this.messageBuffer.data.output_tokens,
          available_quotas: this.messageBuffer.data.available_quotas,
        },
      };
      handleChunk(streamChunk);
    }

    return updatedBuffer;
  }

  /**
   * Process the entire stream internally
   */
  private async processStream(): Promise<
    IMessageResponse<AnsibleLightspeedMessageAttributes>
  > {
    // Initialize message buffer
    this.messageBuffer = {
      data: {
        id: 0,
        role: '',
        token: '',
        referenced_documents: [],
        truncated: false,
        input_tokens: 0,
        output_tokens: 0,
        available_quotas: {},
      },
      event: 'message',
    };

    if (!this.response.body) {
      throw new Error('Response body is null');
    }

    const reader = this.response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const chunk = await this.processLine(line.trim());
          if (chunk) {
            messageBuffer = this.processChunk(
              chunk,
              messageBuffer,
              this.handleChunk
            );
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const chunk = await this.processLine(buffer.trim());
        if (chunk) {
          messageBuffer = this.processChunk(
            chunk,
            messageBuffer,
            this.handleChunk
          );
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
      messageId: this.messageBuffer.data.id.toString() || crypto.randomUUID(),
      answer: this.messageBuffer.data.token,
      conversationId: this.conversationId,
      additionalAttributes: {
        provider: undefined,
        model: undefined,
        input_tokens: this.messageBuffer.data.input_tokens,
        output_tokens: this.messageBuffer.data.output_tokens,
        referenced_documents: this.messageBuffer.data.referenced_documents,
        truncated: this.messageBuffer.data.truncated,
        available_quotas: this.messageBuffer.data.available_quotas,
      },
    };
  }

  private async processLine(line: string): Promise<StreamingEvent | void> {
    if (!line || !line.startsWith('data: ')) {
      return;
    }

    const jsonData = line.slice(6); // Remove 'data: ' prefix
    const event: StreamingEvent = JSON.parse(jsonData);
    return event;
  }

  /**
   * Called when an error occurs during streaming
   */
  onError?(error: Error): void {
    console.error('Ansible Lightspeed streaming error:', error);
  }
}
