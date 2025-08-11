import {
  ClientInitLimitation,
  IAIClient,
  IConversation,
  ISendMessageOptions,
  isInitErrorResponse,
} from '@redhat-cloud-services/ai-client-common';

export enum Events {
  MESSAGE = 'message',
  ACTIVE_CONVERSATION = 'active-conversation',
  IN_PROGRESS = 'in-progress',
  CONVERSATIONS = 'conversations',
  INITIALIZING_MESSAGES = 'initializing-messages',
  INIT_LIMITATION = 'init-limitation',
}

export interface Message<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  id: string;
  answer: string;
  role: 'user' | 'bot';
  additionalAttributes?: T;
  date: Date;
}

export type UserQuery = string;

export interface Conversation<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  id: string;
  title: string;
  messages: Message<T>[];
  locked: boolean;
}

export interface MessageOptions {
  stream?: boolean;
  [key: string]: unknown;
}

interface ClientState<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  conversations: Record<string, Conversation<T>>;
  activeConversationId: string | null;
  messageInProgress: boolean;
  isInitialized: boolean;
  isInitializing: boolean;
  client: IAIClient;
  initLimitation: ClientInitLimitation | undefined;
}

interface EventSubscription {
  id: string;
  callback: () => void;
}

export type StateManager<
  T extends Record<string, unknown> = Record<string, unknown>,
  C extends IAIClient<T> = IAIClient<T>
> = {
  init: () => Promise<void>;
  isInitialized: () => boolean;
  isInitializing: () => boolean;
  setActiveConversationId: (conversationId: string) => Promise<void>;
  getActiveConversationId: () => string | null;
  getActiveConversationMessages: () => Message<T>[];
  sendMessage: (query: UserQuery, options?: MessageOptions) => Promise<any>;
  getMessageInProgress: () => boolean;
  getState: () => ClientState<T>;
  subscribe: (event: Events, callback: () => void) => () => void;
  getConversations: () => Conversation<T>[];
  createNewConversation: () => Promise<IConversation>;
  getClient: () => C;
  getInitLimitation: () => ClientInitLimitation | undefined;
};

export function createClientStateManager<
  T extends Record<string, unknown>,
  C extends IAIClient<T>
>(client: C): StateManager<T, C> {
  const state: ClientState<T> = {
    conversations: {},
    activeConversationId: null,
    messageInProgress: false,
    isInitialized: false,
    isInitializing: false,
    client,
    initLimitation: undefined,
  };

  const eventSubscriptions: Record<string, EventSubscription[]> = {
    [Events.MESSAGE]: [],
    [Events.ACTIVE_CONVERSATION]: [],
    [Events.IN_PROGRESS]: [],
    [Events.CONVERSATIONS]: [],
    [Events.INITIALIZING_MESSAGES]: [],
  };

  function notify(event: Events) {
    const subscriptions = eventSubscriptions[event] || [];
    subscriptions.forEach((sub) => {
      try {
        sub.callback();
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
  }

  function notifyAll() {
    [
      Events.MESSAGE,
      Events.ACTIVE_CONVERSATION,
      Events.IN_PROGRESS,
      Events.CONVERSATIONS,
      Events.INITIALIZING_MESSAGES,
    ].forEach((event) => {
      notify(event);
    });
  }

  function initializeConversationState(id: string): Conversation<T> {
    const newConversation: Conversation<T> = {
      id,
      title: 'New conversation',
      messages: [],
      locked: false,
    };
    state.conversations[id] = newConversation;
    notify(Events.CONVERSATIONS);
    return newConversation;
  }

  async function init(): Promise<void> {
    if (state.isInitialized || state.isInitializing) {
      return;
    }

    state.isInitializing = true;
    notify(Events.IN_PROGRESS);
    notify(Events.INITIALIZING_MESSAGES);
    const initOptions = client.getInitOptions();

    try {
      // Call the client's init method to get the initial conversation ID
      const { initialConversationId, conversations, error, limitation } =
        await client.init();
      if (error) {
        throw error;
      }

      if (limitation) {
        state.initLimitation = limitation;
        notify(Events.INIT_LIMITATION);
      }

      conversations.forEach((conversation) => {
        state.conversations[conversation.id] = {
          id: conversation.id,
          title: conversation.title,
          messages: [],
          locked: conversation.locked,
        };
      });
      notify(Events.CONVERSATIONS);

      if (initOptions.initializeNewConversation) {
        // Set the initial conversation as the active conversation
        state.activeConversationId = initialConversationId;
        // Create the initial conversation if it doesn't exist
        if (!state.conversations[initialConversationId]) {
          initializeConversationState(initialConversationId);
        }
        let messages: Message<T>[] = [];
        if (initialConversationId) {
          const history = await client.getConversationHistory(
            initialConversationId
          );
          messages = (Array.isArray(history) ? history : []).reduce(
            (acc, historyMessage) => {
              const humanMessage: Message<T> = {
                id: historyMessage.message_id,
                answer: historyMessage.input,
                role: 'user',
                date: historyMessage.date,
              };
              const botMessage: Message<T> = {
                id: historyMessage.message_id,
                answer: historyMessage.answer,
                role: 'bot',
                date: historyMessage.date,
                additionalAttributes: historyMessage.additionalAttributes,
              };
              acc.push(humanMessage, botMessage);
              return acc;
            },
            [] as Message<T>[]
          );
        }

        state.conversations[initialConversationId].messages = messages;
      }

      state.isInitialized = true;
      state.isInitializing = false;
    } catch (error) {
      console.error('Client initialization failed:', error);
      state.isInitialized = true;
      state.isInitializing = false;
      const errorMessage: Message<T> = {
        date: new Date(),
        id: crypto.randomUUID(),
        answer: '',
        role: 'bot',
      };
      if (isInitErrorResponse(error)) {
        errorMessage.answer = error.message;
      } else {
        errorMessage.answer = JSON.stringify(error);
      }
      const conversationId = state.activeConversationId || crypto.randomUUID();
      if (!state.conversations[conversationId]) {
        initializeConversationState(conversationId);
      }
      state.conversations[conversationId].messages.push(errorMessage);
      state.activeConversationId = conversationId;
      throw error; // Re-throw so callers can handle the failure
    } finally {
      notifyAll();
    }
  }

  function isInitialized() {
    return state.isInitialized;
  }

  function isInitializing() {
    return state.isInitializing;
  }

  async function setActiveConversationId(
    conversationId: string
  ): Promise<void> {
    state.activeConversationId = conversationId;

    // Auto-create conversation if it doesn't exist
    if (!state.conversations[conversationId]) {
      initializeConversationState(conversationId);
    }
    notify(Events.ACTIVE_CONVERSATION);
    notify(Events.CONVERSATIONS);

    state.isInitializing = true;
    try {
      const history = await client.getConversationHistory(conversationId);
      const messages = (Array.isArray(history) ? history : []).reduce(
        (acc, historyMessage) => {
          const humanMessage: Message<T> = {
            date: historyMessage.date,
            id: historyMessage.message_id,
            answer: historyMessage.input,
            role: 'user',
          };
          const botMessage: Message<T> = {
            date: historyMessage.date,
            id: historyMessage.message_id,
            answer: historyMessage.answer,
            role: 'bot',
            additionalAttributes: historyMessage.additionalAttributes,
          };
          acc.push(humanMessage, botMessage);
          return acc;
        },
        [] as Message<T>[]
      );
      state.conversations[conversationId].messages = messages;
    } catch (error) {
      console.error('Error fetching conversation history:', error);
    } finally {
      state.isInitializing = false;
      notify(Events.INITIALIZING_MESSAGES);
      notify(Events.MESSAGE);
    }
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

  function removeMessageFromConversation(
    messageId: string,
    conversationId: string
  ) {
    if (!state.conversations[conversationId]) {
      return;
    }
    const conversation = state.conversations[conversationId];
    if (conversation) {
      conversation.messages = conversation.messages.filter(
        (message) => message.id !== messageId
      );
    }
  }

  async function sendMessage(
    query: UserQuery,
    options?: MessageOptions
  ): Promise<any> {
    if (query.trim().length === 0) {
      return;
    }
    // Check if a message is already in progress
    if (state.messageInProgress) {
      throw new Error(
        'A message is already being processed. Wait for it to complete before sending another message.'
      );
    }

    // Set message in progress
    state.messageInProgress = true;
    notify(Events.IN_PROGRESS);

    if (client.getInitOptions().initializeNewConversation === false) {
      // If the client is not configured to auto-create conversations,
      // we need to ensure the active conversation exists
      if (!state.activeConversationId) {
        try {
          await createNewConversation();
        } catch (error) {
          // unable to create a new conversation, reset in-progress state
          state.messageInProgress = false;
          notify(Events.IN_PROGRESS);
          // TODO create error state and event
          console.error('Failed to create new conversation:', error);
        }
      }
    }

    try {
      // Ensure we have an active conversation
      if (!state.activeConversationId) {
        throw new Error(
          'No active conversation set. Call setActiveConversationId() first.'
        );
      }

      // Auto-create conversation if it doesn't exist
      if (!state.conversations[state.activeConversationId]) {
        initializeConversationState(state.activeConversationId);
      }

      const conversation = state.conversations[state.activeConversationId];
      if (conversation.messages.length === 0) {
        // new conversation, update the title to the initial query
        conversation.title = query;
        notify(Events.CONVERSATIONS);
      }

      // Add user message to state immediately
      conversation.messages.push({
        date: new Date(),
        id: crypto.randomUUID(),
        answer: query,
        role: 'user',
      });
      notify(Events.MESSAGE);

      if (conversation.locked) {
        console.error('Cannot send message in a locked conversation');
        const lockedMessage: Message<T> = {
          date: new Date(),
          id: crypto.randomUUID(),
          answer: 'This conversation is locked and cannot accept new messages.',
          role: 'bot',
        };
        conversation.messages.push(lockedMessage);
        notify(Events.MESSAGE);
        state.messageInProgress = false;
        notify(Events.IN_PROGRESS);
        return;
      }

      // Create bot message placeholder for streaming updates
      const botMessage: Message<T> = {
        date: new Date(),
        id: crypto.randomUUID(),
        answer: '',
        role: 'bot',
      };
      conversation.messages.push(botMessage);

      if (options?.stream) {
        // Get the client's default streaming handler
        const originalHandler = client.getDefaultStreamingHandler();
        if (originalHandler) {
          const enhancedOptions: ISendMessageOptions<T> = {
            ...options,
            afterChunk: (chunk) => {
              botMessage.answer = chunk.answer;
              botMessage.id = chunk.messageId ?? botMessage.id;
              botMessage.additionalAttributes = chunk.additionalAttributes;
              notify(Events.MESSAGE);
            },
          };

          return client
            .sendMessage(conversation.id, query, enhancedOptions)
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
          throw new Error(
            'Streaming requested but no default streaming handler available in client'
          );
        }
      } else {
        // Non-streaming: update bot message after response
        return client
          .sendMessage(conversation.id, query, options)
          .catch((error) => {
            removeMessageFromConversation(botMessage.id, conversation.id);
            throw error;
          })
          .then((response) => {
            if (response) {
              if (
                typeof response === 'object' &&
                response &&
                'answer' in response &&
                'messageId' in response
              ) {
                const typedResponse = response as {
                  answer: string;
                  messageId: string;
                  additionalAttributes?: T;
                };
                botMessage.answer = typedResponse.answer;
                botMessage.id = typedResponse.messageId || botMessage.id;
                if (typedResponse.additionalAttributes) {
                  botMessage.additionalAttributes =
                    typedResponse.additionalAttributes;
                }
              } else if (typeof response === 'string') {
                botMessage.answer = response as string;
              }
            }
            return response;
          })
          .finally(() => {
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

  function getConversations(): Conversation<T>[] {
    return Object.values(state.conversations);
  }

  function getMessageInProgress() {
    return state.messageInProgress;
  }

  async function createNewConversation(): Promise<IConversation> {
    const newConversation = await client.createNewConversation();
    initializeConversationState(newConversation.id);
    await setActiveConversationId(newConversation.id);
    notifyAll();

    return newConversation;
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

    const index = eventSubscriptions[event].findIndex(
      (sub) => sub.id === subscriptionId
    );
    if (index !== -1) {
      eventSubscriptions[event].splice(index, 1);
    }
  }

  function getActiveConversationId(): string | null {
    return state.activeConversationId;
  }

  function getClient(): C {
    return client;
  }

  function getInitLimitation(): ClientInitLimitation | undefined {
    return state.initLimitation;
  }

  return {
    init,
    isInitialized,
    isInitializing,
    setActiveConversationId,
    getActiveConversationId,
    getActiveConversationMessages,
    sendMessage,
    getMessageInProgress,
    getState,
    subscribe,
    getConversations,
    createNewConversation,
    getClient,
    getInitLimitation,
  };
}
