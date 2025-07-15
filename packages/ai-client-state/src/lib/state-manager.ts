import { IAIClient, ISendMessageOptions } from '@redhat-cloud-services/ai-client-common';

export enum Events {
  MESSAGE = 'message',
  ACTIVE_CONVERSATION = 'active-conversation',
  IN_PROGRESS = 'in-progress'
}

export interface Message {
  id: string;
  answer: string;
  role: 'user' | 'bot';
}

export interface Conversation {
  id: string;
  messages: Message[];
}

export interface MessageOptions {
  stream?: boolean;
  [key: string]: unknown;
}

interface ClientState {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
  messageInProgress: boolean;
}

interface EventSubscription {
  id: string;
  callback: () => void;
}

type SendMessageResponse = string | { answer: string, messageId: string };

export type StateManager = {
    setActiveConversationId: (conversationId: string) => void;
    getActiveConversationMessages: () => Message[];
    sendMessage: (message: Message, options?: MessageOptions) => Promise<any>;
    getMessageInProgress: () => boolean;
    getState: () => ClientState;
    subscribe: (event: Events, callback: () => void) => () => void;
}

export function createClientStateManager(client: IAIClient): StateManager {
  const state: ClientState = {
    conversations: {},
    activeConversationId: null,
    messageInProgress: false
  };

  const eventSubscriptions: Record<string, EventSubscription[]> = {
    [Events.MESSAGE]: [],
    [Events.ACTIVE_CONVERSATION]: [],
    [Events.IN_PROGRESS]: []
  };

  function notify(event: Events) {
    const subscriptions = eventSubscriptions[event] || [];
    subscriptions.forEach(sub => {
      try {
        sub.callback();
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
  }

  function setActiveConversationId(conversationId: string) {
    state.activeConversationId = conversationId;
    
    // Auto-create conversation if it doesn't exist
    if (!state.conversations[conversationId]) {
      state.conversations[conversationId] = {
        id: conversationId,
        messages: []
      };
    }
    
    notify(Events.ACTIVE_CONVERSATION);
  }

  function getActiveConversationMessages(): Message[] {
    if (!state.activeConversationId) {
      return [];
    }
    
    const conversation = state.conversations[state.activeConversationId];
    return conversation ? conversation.messages : [];
  }

  function getState() {
    return state;
  }

  async function sendMessage(message: Message, options?: MessageOptions): Promise<any> {
    // Check if a message is already in progress
    if (state.messageInProgress) {
      throw new Error('A message is already being processed. Wait for it to complete before sending another message.');
    }

    // Set message in progress
    state.messageInProgress = true;
    notify(Events.IN_PROGRESS);

    try {
      // Ensure we have an active conversation
      if (!state.activeConversationId) {
        throw new Error('No active conversation set. Call setActiveConversationId() first.');
      }
      
      // Auto-create conversation if it doesn't exist
      if (!state.conversations[state.activeConversationId]) {
        state.conversations[state.activeConversationId] = {
          id: state.activeConversationId,
          messages: []
        };
      }
      
      const conversation = state.conversations[state.activeConversationId];
      
      // Add user message to state immediately
      conversation.messages.push(message);
      
      // Create bot message placeholder for streaming updates
      const botMessage: Message = {
        id: crypto.randomUUID(),
        answer: '',
        role: 'bot'
      };
      conversation.messages.push(botMessage);
      
      if (options?.stream) {
        // Get the client's default streaming handler
        const originalHandler = client.getDefaultStreamingHandler?.();
        
        if (originalHandler) {
          const enhancedOptions: ISendMessageOptions<string | { answer: string, messageId: string }> = {
            ...options,
            afterChunk: (chunk) => {
              if (typeof chunk === 'string') {
                botMessage.answer += chunk;
              } else if (chunk && typeof chunk === 'object' && 'answer' in chunk) {
                botMessage.answer = chunk.answer;
                botMessage.id = chunk.messageId || botMessage.id;
              }
              notify(Events.MESSAGE);
            }
          }    
          
          return client.sendMessage<SendMessageResponse>(conversation.id, message.answer, enhancedOptions)
            .then((response) => {
              return response;
            }).finally(() => {
              state.messageInProgress = false;
              notify(Events.IN_PROGRESS);
            });
        } else {
          // No streaming handler available but stream was requested
          throw new Error('Streaming requested but no default streaming handler available in client');
        }
      } else {
        // Non-streaming: update bot message after response
        return client.sendMessage<SendMessageResponse>(conversation.id, message.answer, options)
          .then((response) => {
            if (response) {
              if (typeof response === 'object' && 'answer' in response && 'messageId' in response) {
                botMessage.answer = response.answer;
                botMessage.id = response.messageId || botMessage.id;
              } else if (typeof response === 'string') {
                botMessage.answer = response;
              }
            }
            return response;
          }).finally(() => {
            state.messageInProgress = false;
            notify(Events.IN_PROGRESS);
            notify(Events.MESSAGE);
          });
      }
    } catch (error) {
      // Make sure to reset progress flag on any error
      state.messageInProgress = false;
      notify(Events.IN_PROGRESS);
      throw error;
    }
  }

  function getMessageInProgress() {
    return state.messageInProgress;
  }

  function subscribe(event: Events, callback: () => void) {
    const id = crypto.randomUUID();
    const subscription: EventSubscription = { id, callback };
    
    if (!eventSubscriptions[event]) {
      eventSubscriptions[event] = [];
    }
    
    eventSubscriptions[event].push(subscription);
    
    return () => unsubscribe(event, id);
  }

  function unsubscribe(event: Events, subscriptionId: string) {
    if (!eventSubscriptions[event]) {
      return;
    }
    
    const index = eventSubscriptions[event].findIndex(sub => sub.id === subscriptionId);
    if (index !== -1) {
      eventSubscriptions[event].splice(index, 1);
    }
  }

  return {
    setActiveConversationId,
    getActiveConversationMessages,
    sendMessage,
    getMessageInProgress,
    getState,
    subscribe,
  };
}
