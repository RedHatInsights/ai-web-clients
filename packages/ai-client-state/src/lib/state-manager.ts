import { IAIClient, wrapStreamingHandler } from "@redhat-cloud-services/ai-client-common";

export type Message = {
  id: string;
  content: string;
  role: 'user' | 'bot';
}

export type MessageOptions = {
  stream?: boolean;
}


export type ConversationState = {
  id: string;
  messages: Message[];
}

export type ClientState = {
  client: IAIClient;
  activeConversationId?: string;
  conversations: Record<string, ConversationState>;
  messageInProgress: boolean;
}

export enum Events {
  MESSAGE = "message",
  ACTIVE_CONVERSATION = "active-conversation",
  IN_PROGRESS = "in-progress",
}


export type SubscriptionId = ReturnType<typeof crypto.randomUUID>;
type EventSubscriber = {
  id: SubscriptionId;
  callback: () => void;
}


function createClientStateManager(client: IAIClient, activeConversationId?: string) {
  const Subscriptions = new Map<Events, EventSubscriber[]>();
  Subscriptions.set(Events.MESSAGE, []);
  Subscriptions.set(Events.ACTIVE_CONVERSATION, []);
  Subscriptions.set(Events.IN_PROGRESS, []);

  const state: ClientState = {
    client,
    activeConversationId,
    conversations: {},
    messageInProgress: false,
  }

  function getState() {
    return state;
  }

  function setActiveConversationId(conversationId: string) {
    state.activeConversationId = conversationId;
  }

  function getActiveConversation() {
    if (!state.activeConversationId) {
      return undefined;
    }
    return state.conversations[state.activeConversationId];
  }

  async function sendMessage(message: Message, options?: MessageOptions) {
    state.messageInProgress = true;
    const conversation = getActiveConversation();
    if (!conversation) {
      throw new Error('No active conversation');
    }
    
    // Add user message to state immediately
    conversation.messages.push(message);
    
    // Create bot message placeholder for streaming updates
    const botMessage: Message = {
      id: crypto.randomUUID(),
      content: '',
      role: 'bot'
    };
    conversation.messages.push(botMessage);
    
    if (options?.stream) {
      // Get the client's default streaming handler
      const originalHandler = client.getDefaultStreamingHandler?.();
      
      if (originalHandler) {
        // Wrap the streaming handler to update state
        const wrappedHandler = wrapStreamingHandler(
          originalHandler,
          {
            beforeChunk: (chunk: unknown) => {
              // Update bot message content in state before the original handler
              if (typeof chunk === 'string') {
                botMessage.content += chunk;
              } else if (chunk && typeof chunk === 'object' && 'answer' in chunk) {
                // Handle structured chunk format (like from ARH client)
                const structuredChunk = chunk as { answer?: string };
                botMessage.content = structuredChunk.answer || botMessage.content;
              }
            }
          }
        );
        
        // Set the wrapped handler as temporary override
        client.setTemporaryStreamingHandler?.(wrappedHandler);
        
        return client.sendMessage(conversation.id, message.content, options)
          .then((response) => {
            return response;
          }).finally(() => {
            state.messageInProgress = false;
          });
      } else {
        state.messageInProgress = false;
        // No streaming handler available but stream was requested
        throw new Error('Streaming requested but no default streaming handler available in client');
      }
    } else {
      // Non-streaming: update bot message after response
      return client.sendMessage(conversation.id, message.content, options)
        .then((response) => {
          if (response) {
            botMessage.content = response.content;
            botMessage.id = response.messageId;
          }
          return response;
        }).finally(() => {
          state.messageInProgress = false;
        });
    }
  }

  function getMessageInProgress() {
    return state.messageInProgress;
  }

  function subscribe(event: Events, callback: () => void) {
    const id = crypto.randomUUID();
    const callbacks = Subscriptions.get(event);
    if (!callbacks) {
      throw new Error(`Event ${event} not found`);
    }
    callbacks.push({ id, callback });
    Subscriptions.set(event, callbacks);
  }

  function unsubscribe(event: Events, id: ReturnType<typeof crypto.randomUUID>) {
    const callbacks = Subscriptions.get(event);
    if (!callbacks) {
      throw new Error(`Event ${event} not found`);
    }
    callbacks.filter((subscriber) => subscriber.id !== id);
    Subscriptions.set(event, callbacks);
  }

  function getActiveConversationMessages() {
    return getActiveConversation()?.messages || [];
  }

  function notify(event: Events) {
    const callbacks = Subscriptions.get(event);
    if (callbacks) {
      callbacks.forEach((subscriber) => subscriber.callback());
    }
  }

  const toBeNotified = {
    setActiveConversationId: (...args: Parameters<typeof setActiveConversationId>) => {
      setActiveConversationId(...args);
      notify(Events.ACTIVE_CONVERSATION);
    },
    sendMessage: async (...args: Parameters<typeof sendMessage>) => {
      const res = await sendMessage(...args);
      notify(Events.MESSAGE);
      notify(Events.IN_PROGRESS);
      return res;
    }
  };

  return {
    client,
    getState,
    subscribe,
    unsubscribe,
    getActiveConversationMessages,
    getMessageInProgress,
    ...toBeNotified,
  }
}

export default createClientStateManager;