import {
  AfterChunkCallback,
  IStreamChunk,
  IStreamingHandler,
} from '@redhat-cloud-services/ai-client-common';
import {
  isEndEvent,
  isTokenEvent,
  MessageEvent,
  StreamingEvent,
} from './streaming-types';
import { AnsibleLightspeedMessageAttributes } from './types';

/**
 * Default streaming handler for processing Server-Sent Events from Ansible Lightspeed API
 */
export class DefaultStreamingHandler
  implements IStreamingHandler<StreamingEvent>
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

  onStart(): void {
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
  }

  onChunk(
    chunk: StreamingEvent,
    afterChunk?: (
      chunk: IStreamChunk<AnsibleLightspeedMessageAttributes>
    ) => void
  ): void {
    if (isTokenEvent(chunk)) {
      this.messageBuffer.data.id = chunk.data.id;
      this.messageBuffer.data.role = chunk.data.role;
      this.messageBuffer.data.token += chunk.data.token;
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

    if (afterChunk) {
      const commonChunk: IStreamChunk<AnsibleLightspeedMessageAttributes> = {
        answer: this.messageBuffer.data.token,
        additionalAttributes: {
          referenced_documents: this.messageBuffer.data.referenced_documents,
          truncated: this.messageBuffer.data.truncated,
          input_tokens: this.messageBuffer.data.input_tokens,
          output_tokens: this.messageBuffer.data.output_tokens,
          available_quotas: this.messageBuffer.data.available_quotas,
        },
      };
      afterChunk?.(commonChunk);
    }
  }

  onComplete(_finalChunk: StreamingEvent): void {
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
  }
  /**
   * Process a streaming response from the API
   */
  async processStream(
    response: Response,
    afterChunk?: AfterChunkCallback<AnsibleLightspeedMessageAttributes>
  ): Promise<void> {
    this.onStart();
    if (!response.body) {
      throw new Error('Response body is null');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
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
            this.onChunk(chunk, afterChunk);
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        await this.processLine(buffer.trim());
      }

      this.onComplete(this.messageBuffer);
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      errorObj;
    } finally {
      reader.releaseLock();
    }
  }

  private async processLine(line: string): Promise<StreamingEvent | void> {
    if (!line || !line.startsWith('data: ')) {
      return;
    }

    const jsonData = line.slice(6); // Remove 'data: ' prefix
    const event: StreamingEvent = JSON.parse(jsonData);
    return event;
  }
}

/**
 * Process a stream with a handler function
 */
export async function processStreamWithHandler(
  response: Response,
  handler: IStreamingHandler<StreamingEvent>,
  afterChunk?: AfterChunkCallback<AnsibleLightspeedMessageAttributes>
): Promise<void> {
  if (handler instanceof DefaultStreamingHandler) {
    return handler.processStream(response, afterChunk);
  }

  throw new Error(
    'Unsupported streaming handler type. Use DefaultStreamingHandler for Ansible Lightspeed.'
  );
}
