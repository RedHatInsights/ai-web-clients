import { StreamingEvent, StreamProcessingOptions } from './streaming-types';

/**
 * Default streaming handler for processing Server-Sent Events from Ansible Lightspeed API
 */
export class DefaultStreamingHandler {
  /**
   * Process a streaming response from the API
   */
  async processStream(
    stream: ReadableStream<Uint8Array>,
    options: StreamProcessingOptions = {}
  ): Promise<void> {
    const reader = stream.getReader();
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
          await this.processLine(line.trim(), options);
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        await this.processLine(buffer.trim(), options);
      }

      options.onComplete?.();
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      options.onError?.(errorObj);
    } finally {
      reader.releaseLock();
    }
  }

  private async processLine(
    line: string,
    options: StreamProcessingOptions
  ): Promise<void> {
    if (!line || !line.startsWith('data: ')) {
      return;
    }

    try {
      const jsonData = line.slice(6); // Remove 'data: ' prefix
      const event: StreamingEvent = JSON.parse(jsonData);
      options.onEvent?.(event);
    } catch (error) {
      const errorObj = error instanceof Error 
        ? error 
        : new Error(`Failed to parse streaming data: ${line}`);
      options.onError?.(errorObj);
    }
  }
}

/**
 * Process a stream with a handler function
 */
export async function processStreamWithHandler(
  stream: ReadableStream<Uint8Array>,
  options: StreamProcessingOptions = {}
): Promise<void> {
  const handler = new DefaultStreamingHandler();
  return handler.processStream(stream, options);
}