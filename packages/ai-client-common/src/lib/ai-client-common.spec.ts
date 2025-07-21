import {
  AIClientError,
  AIClientValidationError,
  IValidationError,
  IBaseClientConfig,
  IRequestOptions,
  IAIClient,
  IStreamingHandler,
  IStreamingRequestOptions,
  IAPIResponse,
  IFetchFunction,
  HttpMethod,
  IMessageResponse,
  ISendMessageOptions,
  IConversationHistoryResponse,
} from './ai-client-common';


type AdditionalAttributesTest = {
  foo?: string;
  bar?: number;
}

describe('ai-client-common', () => {
  describe('AIClientError', () => {
    it('should create error with all properties', () => {
      const error = new AIClientError(404, 'Not Found', 'Resource not found', { id: '123' });
      
      expect(error.name).toBe('AIClientError');
      expect(error.message).toBe('Resource not found');
      expect(error.status).toBe(404);
      expect(error.statusText).toBe('Not Found');
      expect(error.data).toEqual({ id: '123' });
      expect(error instanceof Error).toBe(true);
    });

    it('should create error without optional data', () => {
      const error = new AIClientError(500, 'Internal Server Error', 'Something went wrong');
      
      expect(error.name).toBe('AIClientError');
      expect(error.message).toBe('Something went wrong');
      expect(error.status).toBe(500);
      expect(error.statusText).toBe('Internal Server Error');
      expect(error.data).toBeUndefined();
    });

    it('should be instanceof Error and AIClientError', () => {
      const error = new AIClientError(400, 'Bad Request', 'Invalid input');
      
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AIClientError).toBe(true);
    });
  });

  describe('AIClientValidationError', () => {
    it('should create validation error with validation details', () => {
      const validationErrors: IValidationError[] = [
        { loc: ['field1'], msg: 'Field is required', type: 'missing' },
        { loc: ['field2', 0], msg: 'Invalid type', type: 'type_error' }
      ];
      
      const error = new AIClientValidationError(validationErrors);
      
      expect(error.name).toBe('AIClientValidationError');
      expect(error.message).toBe('Request validation failed');
      expect(error.status).toBe(422);
      expect(error.statusText).toBe('Validation Error');
      expect(error.data).toEqual(validationErrors);
      expect(error.validationErrors).toEqual(validationErrors);
    });

    it('should be instanceof Error, AIClientError, and AIClientValidationError', () => {
      const validationErrors: IValidationError[] = [
        { loc: ['test'], msg: 'Test error', type: 'test' }
      ];
      const error = new AIClientValidationError(validationErrors);
      
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AIClientError).toBe(true);
      expect(error instanceof AIClientValidationError).toBe(true);
    });

    it('should handle empty validation errors array', () => {
      const error = new AIClientValidationError([]);
      
      expect(error.validationErrors).toEqual([]);
      expect(error.data).toEqual([]);
    });
  });

  describe('Type Definitions', () => {
    it('should accept valid HttpMethod values', () => {
      const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
      methods.forEach(method => {
        expect(typeof method).toBe('string');
        expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).toContain(method);
      });
    });

    it('should validate IValidationError structure', () => {
      const validationError: IValidationError = {
        loc: ['field', 'subfield'],
        msg: 'Error message',
        type: 'validation_error'
      };
      
      expect(Array.isArray(validationError.loc)).toBe(true);
      expect(typeof validationError.msg).toBe('string');
      expect(typeof validationError.type).toBe('string');
    });

    it('should validate IAPIResponse structure', () => {
      const response: IAPIResponse<{ test: string }> = {
        data: { test: 'value' },
        error: 'No error',
        status: 200
      };
      
      expect(response.data).toEqual({ test: 'value' });
      expect(response.error).toBe('No error');
      expect(response.status).toBe(200);
    });

    it('should validate IBaseClientConfig structure without default handler', () => {
      const mockFetch: IFetchFunction = async (input, init) => {
        void input; void init; // Mark parameters as used for linting
        return new Response('{}', { status: 200 });
      };
      
      const config: IBaseClientConfig = {
        baseUrl: 'https://api.example.com',
        fetchFunction: mockFetch
      };
      
      expect(typeof config.baseUrl).toBe('string');
      expect(typeof config.fetchFunction).toBe('function');
      expect(config.defaultStreamingHandler).toBeUndefined();
    });

    it('should validate IBaseClientConfig structure with default handler', () => {
      const mockFetch: IFetchFunction = async (input, init) => {
        void input; void init; // Mark parameters as used for linting
        return new Response('{}', { status: 200 });
      };
      
      const mockHandler: IStreamingHandler<string> = {
        onChunk: (chunk: string) => { void chunk; /* process */ }
      };
      
      const config: IBaseClientConfig<string> = {
        baseUrl: 'https://api.example.com',
        fetchFunction: mockFetch,
        defaultStreamingHandler: mockHandler
      };
      
      expect(typeof config.baseUrl).toBe('string');
      expect(typeof config.fetchFunction).toBe('function');
      expect(typeof config.defaultStreamingHandler).toBe('object');
      expect(typeof config.defaultStreamingHandler?.onChunk).toBe('function');
    });

    it('should validate IRequestOptions structure', () => {
      const options: IRequestOptions = {
        headers: { 'Authorization': 'Bearer token' },
        signal: new AbortController().signal
      };
      
      expect(typeof options.headers).toBe('object');
      expect(options.signal instanceof AbortSignal).toBe(true);
    });

    it('should validate IMessageResponse structure', () => {
      const messageResponse: IMessageResponse = {
        messageId: 'msg-123',
        answer: 'Hello world',
        conversationId: 'conv-456',
        createdAt: '2024-01-01T10:00:00Z',
        additionalAttributes: {
          model: 'gpt-4',
          tokens: 50
        }
      };
      
      expect(typeof messageResponse.messageId).toBe('string');
      expect(typeof messageResponse.answer).toBe('string');
      expect(typeof messageResponse.conversationId).toBe('string');
      expect(typeof messageResponse.createdAt).toBe('string');
      expect(typeof messageResponse.additionalAttributes).toBe('object');
    });

    it('should validate ISendMessageOptions structure for non-streaming', () => {
      const options: ISendMessageOptions = {
        headers: { 'Content-Type': 'application/json' },
        signal: new AbortController().signal,
        stream: false
      };
      
      expect(typeof options.headers).toBe('object');
      expect(options.signal instanceof AbortSignal).toBe(true);
      expect(options.stream).toBe(false);
    });

    it('should validate ISendMessageOptions structure for streaming', () => {
      const options: ISendMessageOptions = {
        headers: { 'Accept': 'text/stream' },
        stream: true
      };
      
      expect(typeof options.headers).toBe('object');
      expect(options.stream).toBe(true);
    });
  });

  describe('Interface Compliance', () => {
    it('should allow proper IAIClient implementation', () => {
      class TestClient implements IAIClient<Record<string, unknown>> {
        async init(): Promise<string> {
          return 'test-conversation-id';
        }

        async sendMessage(
          conversationId: string, 
          message: string, 
          options?: ISendMessageOptions
        ): Promise<IMessageResponse | void> {
          void conversationId; void message; void options; // Mark parameters as used for linting
          if (options?.stream) {
            return; // Streaming mode returns void
          }
          return {
            messageId: 'msg-123',
            answer: 'Response content',
            conversationId: 'conv-456'
          };
        }
        
        getDefaultStreamingHandler<TChunk = unknown>(): IStreamingHandler<TChunk> | undefined {
          return undefined; // No default handler for this test client
        }

        async getConversationHistory<T extends AdditionalAttributesTest>(
          conversationId: string, 
          options?: IRequestOptions
        ): Promise<IConversationHistoryResponse<T>> {
          void conversationId; void options; // Mark parameters as used for linting
          return [];
        }
        
        async healthCheck(options?: IRequestOptions): Promise<unknown> {
          void options; // Mark parameter as used for linting
          return { status: 'healthy' };
        }
        
        async getServiceStatus(options?: IRequestOptions): Promise<unknown> {
          void options; // Mark parameter as used for linting
          return { status: 'running' };
        }
      }
      
      const client = new TestClient();
      expect(typeof client.sendMessage).toBe('function');
      expect(typeof client.healthCheck).toBe('function');
      expect(typeof client.getServiceStatus).toBe('function');
    });

    it('should handle sendMessage in non-streaming mode', async () => {
      class TestClient implements IAIClient {
        async init(): Promise<string> {
          return 'test-conversation-id';
        }

        async sendMessage(
          conversationId: string, 
          message: string, 
          options?: ISendMessageOptions
        ): Promise<IMessageResponse | void> {
          void options; // Mark parameter as used for linting
          return {
            messageId: 'msg-123',
            answer: `Response to: ${message}`,
            conversationId
          };
        }
        
        getDefaultStreamingHandler<TChunk = unknown>(): IStreamingHandler<TChunk> | undefined {
          return undefined;
        }

        async getConversationHistory<T extends AdditionalAttributesTest>(
          conversationId: string, 
          options?: IRequestOptions
        ): Promise<IConversationHistoryResponse<T>> {
          void conversationId; void options; // Mark parameters as used for linting
          return [];
        }
        
        async healthCheck(): Promise<unknown> {
          return { status: 'healthy' };
        }
      }
      
      const client = new TestClient();
      const response = await client.sendMessage('conv-123', 'Hello AI');
      
      expect(response).toBeDefined();
      if (response) {
        expect(response.messageId).toBe('msg-123');
        expect(response.answer).toBe('Response to: Hello AI');
        expect(response.conversationId).toBe('conv-123');
      }
    });

    it('should handle sendMessage in streaming mode', async () => {
      let chunks: string[] = [];
      
      const mockHandler: IStreamingHandler<string> = {
        onChunk: (chunk: string) => { chunks.push(chunk); },
        onStart: () => { chunks = []; },
        onComplete: () => { /* complete */ }
      };
      
      class TestClient implements IAIClient {
        private defaultHandler: IStreamingHandler<string> = mockHandler;

        async init(): Promise<string> {
          return 'test-conversation-id';
        }
        
        async sendMessage(
          conversationId: string, 
          message: string, 
          options?: ISendMessageOptions
        ): Promise<IMessageResponse | void> {
          if (options?.stream && this.defaultHandler) {
            // Simulate streaming response using default handler
            this.defaultHandler.onStart?.(conversationId, 'msg-456');
            this.defaultHandler.onChunk('Hello');
            this.defaultHandler.onChunk(' world');
            this.defaultHandler.onComplete?.('Hello world');
            return; // Streaming returns void
          }
          return {
            messageId: 'msg-456',
            answer: 'Non-streaming response',
            conversationId
          };
        }
        
        getDefaultStreamingHandler<TChunk = unknown>(): IStreamingHandler<TChunk> | undefined {
          return this.defaultHandler as IStreamingHandler<TChunk>;
        }

        async getConversationHistory<T extends AdditionalAttributesTest>(
          conversationId: string, 
          options?: IRequestOptions
        ): Promise<IConversationHistoryResponse<T>> {
          void conversationId; void options; // Mark parameters as used for linting
          return [];
        }
        
        async healthCheck(): Promise<unknown> {
          return { status: 'healthy' };
        }
      }
      
      const client = new TestClient();
      
      const response = await client.sendMessage('conv-123', 'Hello AI', {
        stream: true
      });
      
      expect(response).toBeUndefined(); // Streaming returns void
      expect(chunks).toEqual(['Hello', ' world']);
    });

    // TODO: Add integration tests for default streaming handler functionality
    // Complex TypeScript generics make testing challenging - will be covered in real implementations

    it('should allow proper IStreamingHandler implementation', () => {
      class TestStreamingHandler implements IStreamingHandler<string> {
        onChunk(chunk: string): void {
          void chunk; // Mark parameter as used for linting
          // Process chunk
        }
        
        onStart(conversationId?: string, messageId?: string): void {
          void conversationId; void messageId; // Mark parameters as used for linting
          // Handle start
        }
        
        onComplete(finalChunk: string): void {
          void finalChunk; // Mark parameter as used for linting
          // Handle completion
        }
        
        onError(error: Error): void {
          void error; // Mark parameter as used for linting
          // Handle error
        }
        
        onAbort(): void {
          // Handle abort
        }
      }
      
      const handler = new TestStreamingHandler();
      expect(typeof handler.onChunk).toBe('function');
      expect(typeof handler.onStart).toBe('function');
      expect(typeof handler.onComplete).toBe('function');
      expect(typeof handler.onError).toBe('function');
      expect(typeof handler.onAbort).toBe('function');
    });

    it('should validate IStreamingRequestOptions structure', () => {
      const mockHandler: IStreamingHandler<string> = {
        onChunk: (chunk: string) => { void chunk; /* process */ }
      };
      
      const options: IStreamingRequestOptions<string> = {
        headers: { 'Accept': 'text/stream' },
        signal: new AbortController().signal,
        streamingHandler: mockHandler
      };
      
      expect(typeof options.headers).toBe('object');
      expect(options.signal instanceof AbortSignal).toBe(true);
      expect(typeof options.streamingHandler).toBe('object');
      expect(typeof options.streamingHandler.onChunk).toBe('function');
    });
  });

  describe('IFetchFunction Interface', () => {
    it('should match native fetch signature', async () => {
      const mockFetch: IFetchFunction = async (input, init) => {
        void input; void init; // Mark parameters as used for linting
        return new Response('{"success": true}', { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      
      // Test with URL string
      const response1 = await mockFetch('https://api.example.com/test');
      expect(response1.status).toBe(200);
      
      // Test with Request object
      const request = new Request('https://api.example.com/test', { method: 'POST' });
      const response2 = await mockFetch(request);
      expect(response2.status).toBe(200);
      
      // Test with RequestInit options
      const response3 = await mockFetch('https://api.example.com/test', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response3.status).toBe(200);
    });
  });
});
