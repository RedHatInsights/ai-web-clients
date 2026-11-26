import {
  HandleChunkCallback,
  IMessageResponse,
  IStreamChunk,
} from '@redhat-cloud-services/ai-client-common';
import {
  ActiveAgent,
  MASAdditionalAttributes,
  SessionChatResponse,
} from './types';
import { StreamEvent, isEmpty } from './streaming-types';
import { isWidgetStreamEvent } from './widget-types';
import {
  WidgetStore,
  applySessionInteractionEvent,
  createWidgetStore,
  extractWidgetInstances,
} from './widget-store';

/**
 * NDJSON streaming handler for MAS session.subscribe endpoint.
 *
 * Connects to GET /sessions/session.subscribe?sessionId=... and processes
 * newline-delimited JSON events, accumulating llm_token chunks into the answer.
 * On stream_end, fetches the final chat state via getChatState callback.
 */
export class DefaultStreamingHandler {
  private messageBuffer = '';
  private agentMap = new Map<string, ActiveAgent>();
  private widgetStore: WidgetStore = createWidgetStore();
  private streamPromise: Promise<IMessageResponse<MASAdditionalAttributes>>;

  constructor(
    private response: Response,
    private sessionId: string,
    private messageId: string,
    private handleChunk: HandleChunkCallback<MASAdditionalAttributes>,
    private getChatState: (sessionId: string) => Promise<SessionChatResponse>
  ) {
    this.streamPromise = this.processStream();
  }

  private activeAgents(): ActiveAgent[] {
    return Array.from(this.agentMap.values());
  }

  private trackAgent(event: StreamEvent, status: ActiveAgent['status']): void {
    if (!event.node || !event.display_name) return;
    this.agentMap.set(event.node, {
      nodeId: event.node,
      name: event.display_name,
      status,
    });
  }

  /**
   * Widget-related fields to merge into every emitted chunk's
   * `additionalAttributes`, once any widget/interaction event has arrived on
   * this turn's stream. Omitted entirely (not an empty array) for ordinary
   * turns that never touch a widget, so existing consumers see no change.
   */
  private widgetAttributes(): Partial<MASAdditionalAttributes> {
    if (this.widgetStore.size === 0) return {};
    const widgets = extractWidgetInstances(this.widgetStore);
    return {
      widgets,
      hasPendingInteraction: widgets.some(
        (widget) => widget.interaction?.status === 'pending'
      ),
    };
  }

  private async processStream(): Promise<
    IMessageResponse<MASAdditionalAttributes>
  > {
    if (!this.response.body) {
      throw new Error('No readable stream available from subscribe endpoint');
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

        for (const line of lines) {
          if (!line.trim()) continue;

          let parsed: unknown;
          try {
            parsed = JSON.parse(line.trim());
          } catch {
            continue;
          }

          if (isEmpty(parsed)) continue;

          // Widget/interaction packets ('widget.upserted', 'interaction.requested',
          // 'interaction.updated') use a distinct envelope from the text/progress
          // StreamEvent union below — route them into the widget store and
          // surface the change immediately, without pausing the text stream
          // (the agent may still emit llm_token events after an interaction is
          // requested; it only actually pauses once the backend decides to).
          if (isWidgetStreamEvent(parsed)) {
            if (applySessionInteractionEvent(this.widgetStore, parsed)) {
              const widgetChunk: IStreamChunk<MASAdditionalAttributes> = {
                messageId: this.messageId,
                answer: this.messageBuffer || 'Thinking...',
                conversationId: this.sessionId,
                additionalAttributes: {
                  activeAgents: this.activeAgents(),
                  ...this.widgetAttributes(),
                },
              };
              this.handleChunk(widgetChunk);
            }
            continue;
          }

          const event = parsed as StreamEvent;

          switch (event.type) {
            case 'heartbeat':
              break;

            case 'llm_token':
              this.trackAgent(event, 'running');
              if (event.chunk) {
                // Accumulate internally — kept for future use / agent tracking,
                // but not reflected to the user until the workflow completes.
                accumulatedAnswer += event.chunk;
                this.messageBuffer = accumulatedAnswer;

                const chunk: IStreamChunk<MASAdditionalAttributes> = {
                  messageId: this.messageId,
                  answer: 'Thinking...',
                  conversationId: this.sessionId,
                  additionalAttributes: {
                    activeAgents: this.activeAgents(),
                    ...this.widgetAttributes(),
                  },
                };
                this.handleChunk(chunk);
              }
              break;

            case 'tool_calling':
            case 'tool_result':
              this.trackAgent(event, 'running');
              break;

            case 'complete':
              this.trackAgent(event, 'done');
              if (event.state?.output) {
                accumulatedAnswer = event.state.output;
                this.messageBuffer = accumulatedAnswer;
              }
              break;

            case 'stream_error':
              if (event.node && event.display_name) {
                this.trackAgent(event, 'error');
              }
              this.messageBuffer = event.error || 'An error occurred';
              accumulatedAnswer = this.messageBuffer;

              const errorChunk: IStreamChunk<MASAdditionalAttributes> = {
                messageId: this.messageId,
                answer: this.messageBuffer,
                conversationId: this.sessionId,
                additionalAttributes: {
                  status: 'FAILED',
                  status_message: event.error,
                  activeAgents: this.activeAgents(),
                  ...this.widgetAttributes(),
                },
              };
              this.handleChunk(errorChunk);
              done = true;
              break;

            case 'stream_end':
              done = true;
              break;

            default:
              break;
          }
        }
      }

      // Fetch final state after stream ends
      try {
        const chatState = await this.getChatState(this.sessionId);
        if (chatState.output) {
          accumulatedAnswer = chatState.output;
          this.messageBuffer = accumulatedAnswer;
        }

        const finalAdditionalAttributes: MASAdditionalAttributes = {
          output: chatState.output,
          status: chatState.status,
          status_message: chatState.status_message,
          activeAgents: this.activeAgents(),
          ...this.widgetAttributes(),
        };

        const finalChunk: IStreamChunk<MASAdditionalAttributes> = {
          messageId: this.messageId,
          answer: accumulatedAnswer,
          conversationId: this.sessionId,
          additionalAttributes: finalAdditionalAttributes,
        };
        this.handleChunk(finalChunk);

        return {
          messageId: this.messageId,
          answer: accumulatedAnswer,
          conversationId: this.sessionId,
          additionalAttributes: finalAdditionalAttributes,
        };
      } catch (error) {
        return {
          messageId: this.messageId,
          answer: accumulatedAnswer || this.messageBuffer,
          conversationId: this.sessionId,
          additionalAttributes: this.widgetAttributes(),
        };
      }
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  async getResult(): Promise<IMessageResponse<MASAdditionalAttributes>> {
    return this.streamPromise;
  }

  onError?(error: Error): void {
    console.error('MAS streaming error:', error);
  }
}
