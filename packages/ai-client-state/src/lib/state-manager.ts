import { IAIClient, ISendMessageOptions } from '@redhat-cloud-services/ai-client-common';

export enum Events {
  MESSAGE = 'message',
  ACTIVE_CONVERSATION = 'active-conversation',
  IN_PROGRESS = 'in-progress'
}

export interface Message<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  answer: string;
  role: 'user' | 'bot';
  additionalData?: T;
}

export type UserQuery = string

export interface Conversation<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  messages: Message<T>[];
}

export interface MessageOptions {
  stream?: boolean;
  [key: string]: unknown;
}

interface ClientState<T extends Record<string, unknown> = Record<string, unknown>> {
  conversations: Record<string, Conversation<T>>;
  activeConversationId: string | null;
  messageInProgress: boolean;
  isInitialized: boolean;
  isInitializing: boolean;
  client: IAIClient;
}

interface EventSubscription {
  id: string;
  callback: () => void;
}



export type StateManager<T extends Record<string, unknown> = Record<string, unknown>> = {
    init: () => Promise<void>;
    isInitialized: () => boolean;
    isInitializing: () => boolean;
    setActiveConversationId: (conversationId: string) => void;
    getActiveConversationMessages: () => Message<T>[];
    sendMessage: (query: UserQuery, options?: MessageOptions) => Promise<any>;
    getMessageInProgress: () => boolean;
    getState: () => ClientState<T>;
    subscribe: (event: Events, callback: () => void) => () => void;
}

export function createClientStateManager<T extends Record<string, unknown>>(client: IAIClient<T>): StateManager<T> {
  const state: ClientState<T> = {
    conversations: {},
    activeConversationId: null,
    messageInProgress: false,
    isInitialized: false,
    isInitializing: false,
    client,
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

  async function init(): Promise<void> {
    if (state.isInitialized || state.isInitializing) {
      return;
    }
    
    state.isInitializing = true;
    notify(Events.IN_PROGRESS);
    
    try {
      // Call the client's init method to get the initial conversation ID
      const initialConversationId = await client.init();
      
      // Set the initial conversation as the active conversation
      state.activeConversationId = initialConversationId;

      
      // Create the initial conversation if it doesn't exist
      if (!state.conversations[initialConversationId]) {
        state.conversations[initialConversationId] = {
          id: initialConversationId,
          messages: []
        };
      }

      let messages: Message<T>[] = []
      if(initialConversationId) {
        const history = await client.getConversationHistory(initialConversationId);
        messages = (history || []).reduce<Message<T>[]>((acc, historyMessage) => {
          const humanMessage: Message<T> = {
            id: historyMessage.message_id,
            answer: historyMessage.input,
            role: 'user'
          }
          const botMessage: Message<T> = {
            id: historyMessage.message_id,
            answer: historyMessage.answer,
            role: 'bot',
            additionalData: historyMessage.additionalData
          }
          acc.push(humanMessage, botMessage)
          return acc
        }, [])
      }

      state.conversations[initialConversationId].messages = messages;
      
      state.isInitialized = true;
      state.isInitializing = false;
      notify(Events.IN_PROGRESS);
      notify(Events.MESSAGE);
      notify(Events.ACTIVE_CONVERSATION);
    } catch (error) {
      console.error('Client initialization failed:', error);
      state.isInitialized = false;
      state.isInitializing = false;
      notify(Events.IN_PROGRESS);
      throw error; // Re-throw so callers can handle the failure
    }
  }

  function isInitialized() {
    return state.isInitialized;
  }

  function isInitializing() {
    return state.isInitializing;
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

  function getActiveConversationMessages(): Message<T>[] {
    if (!state.activeConversationId) {
      return [];
    }
    
    const conversation = state.conversations[state.activeConversationId];
    return conversation ? conversation.messages : [];
  }

  function getState() {
    return state;
  }

  function removeMessageFromConversation(messageId: string, conversationId: string) {
    if (!state.conversations[conversationId]) {
      return;
    }
    const conversation = state.conversations[conversationId];
    if (conversation) {
      conversation.messages = conversation.messages.filter(message => message.id !== messageId);
    }
  }

  async function sendMessage(query: UserQuery, options?: MessageOptions): Promise<any> {
    if (query.trim().length === 0) {
      return;
    }
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
      conversation.messages.push({
        id: crypto.randomUUID(),
        answer: query,
        role: 'user',
      });
      notify(Events.MESSAGE);
      
      // Create bot message placeholder for streaming updates
      const botMessage: Message<T> = {
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

          return client.sendMessage(conversation.id, query, enhancedOptions)
            .catch((error) => {
              removeMessageFromConversation(botMessage.id, conversation.id);
              notify(Events.MESSAGE);
              throw error;
            })
            .then((response) => {
              return response;
            })
            .finally(() => {
              state.messageInProgress = false;
              notify(Events.IN_PROGRESS);
            });
        } else {
          // No streaming handler available but stream was requested
          throw new Error('Streaming requested but no default streaming handler available in client');
        }
      } else {
        // Non-streaming: update bot message after response
        return client.sendMessage(conversation.id, query, options)
          .catch((error) => {
            removeMessageFromConversation(botMessage.id, conversation.id);
            throw error;
          })
          .then((response) => {
            if (response) {
              if (typeof response === 'object' && response && 'answer' in response && 'messageId' in response) {
                const typedResponse = response as { answer: string; messageId: string };
                botMessage.answer = typedResponse.answer;
                botMessage.id = typedResponse.messageId || botMessage.id;
              } else if (typeof response === 'string') {
                botMessage.answer = response as string;
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
    init,
    isInitialized,
    isInitializing,
    setActiveConversationId,
    getActiveConversationMessages,
    sendMessage,
    getMessageInProgress,
    getState,
    subscribe,
  };
}
