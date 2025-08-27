import {
  ClientInitLimitation,
  IAIClient,
  IConversation,
  ISendMessageOptions,
  isInitErrorResponse,
} from '@redhat-cloud-services/ai-client-common';

// Temporary conversation constants
const TEMP_CONVERSATION_ID = '__temp_conversation__';

// Helper functions for temporary conversations
function isTemporaryConversationId(id: string | null): boolean {
  return id === TEMP_CONVERSATION_ID;
}

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
  createdAt: Date;
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
  promotionRetryCount: number;
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
  createNewConversation: (force?: boolean) => Promise<IConversation>;
  getClient: () => C;
  getInitLimitation: () => ClientInitLimitation | undefined;
  isTemporaryConversation: () => boolean;
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
    promotionRetryCount: 0,
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
      Events.INIT_LIMITATION,
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
      createdAt: new Date(),
    };
    state.conversations[id] = newConversation;
    notify(Events.CONVERSATIONS);
    return newConversation;
  }

  function handleConversationPromotion(
    originalConversationId: string,
    responseConversationId: string
  ): void {
    if (!originalConversationId || !responseConversationId) {
      return;
    }
    // If the conversation ID changed, we need to promote the conversation
    if (originalConversationId !== responseConversationId) {
      // Transfer messages from original conversation to new conversation
      const originalConversation = state.conversations[originalConversationId];
      if (originalConversation) {
        // Initialize new conversation state
        initializeConversationState(responseConversationId);

        // Transfer all messages
        state.conversations[responseConversationId].messages =
          originalConversation.messages;
        state.conversations[responseConversationId].title =
          originalConversation.title;

        // Update active conversation
        state.activeConversationId = responseConversationId;

        // Clean up original conversation
        delete state.conversations[originalConversationId];

        notify(Events.ACTIVE_CONVERSATION);
        notify(Events.CONVERSATIONS);
      }
    }
  }

  async function promoteTemporaryConversation(): Promise<void> {
    if (!isTemporaryConversationId(state.activeConversationId)) {
      return;
    }

    const MAX_RETRY_ATTEMPTS = 2;

    try {
      // Create real conversation
      const newConversation = await client.createNewConversation();

      // Transfer messages from temporary to real conversation
      const tempMessages =
        state.conversations[TEMP_CONVERSATION_ID]?.messages || [];
      initializeConversationState(newConversation.id);
      state.conversations[newConversation.id].messages = tempMessages;

      // Update title if we have messages
      if (tempMessages.length > 0) {
        const firstUserMessage = tempMessages.find(
          (msg) => msg.role === 'user'
        );
        if (firstUserMessage) {
          state.conversations[newConversation.id].title =
            firstUserMessage.answer;
        }
      }

      // Switch to real conversation
      state.activeConversationId = newConversation.id;

      // Clean up temporary conversation
      delete state.conversations[TEMP_CONVERSATION_ID];

      // Reset retry count on successful promotion
      state.promotionRetryCount = 0;

      notify(Events.ACTIVE_CONVERSATION);
      notify(Events.CONVERSATIONS);
    } catch (error) {
      console.error('Failed to promote temporary conversation:', error);
      state.promotionRetryCount++;

      // If we've exceeded retry attempts, show user-friendly error message
      if (state.promotionRetryCount >= MAX_RETRY_ATTEMPTS) {
        const errorMessage: Message<T> = {
          date: new Date(),
          id: crypto.randomUUID(),
          answer:
            'Unable to initialize conversation. Please check your connection and try again.',
          role: 'bot',
        };

        // Add error message to temporary conversation
        if (state.conversations[TEMP_CONVERSATION_ID]) {
          state.conversations[TEMP_CONVERSATION_ID].messages.push(errorMessage);
          notify(Events.MESSAGE);
        }
      }

      // Keep using temporary conversation for error display
    }
  }

  async function init(): Promise<void> {
    if (state.isInitialized || state.isInitializing) {
      return;
    }

    state.isInitializing = true;
    notify(Events.IN_PROGRESS);
    notify(Events.INITIALIZING_MESSAGES);

    try {
      // Call the client's init method to get existing conversations
      const { conversations, error, limitation } = await client.init();
      if (error) {
        throw error;
      }

      if (limitation) {
        state.initLimitation = limitation;
        notify(Events.INIT_LIMITATION);
      }

      // Load existing conversations without auto-activating any
      conversations.forEach((conversation) => {
        state.conversations[conversation.id] = {
          id: conversation.id,
          title: conversation.title,
          messages: [],
          locked: conversation.locked,
          createdAt: conversation.createdAt,
        };
      });
      notify(Events.CONVERSATIONS);

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
    notify(Events.INITIALIZING_MESSAGES);
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

    try {
      // Auto-create temporary conversation if none exists
      if (!state.activeConversationId) {
        state.activeConversationId = TEMP_CONVERSATION_ID;
        initializeConversationState(TEMP_CONVERSATION_ID);
        notify(Events.ACTIVE_CONVERSATION);
      }

      // Promote temporary conversation to real conversation before API call
      if (isTemporaryConversationId(state.activeConversationId)) {
        await promoteTemporaryConversation();
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

      // Always provide afterChunk callback for state updates - client handles streaming internally
      const enhancedOptions: ISendMessageOptions<T> = {
        ...options,
        afterChunk: (chunk) => {
          botMessage.answer = chunk.answer;
          botMessage.id = chunk.messageId ?? botMessage.id;
          botMessage.additionalAttributes = chunk.additionalAttributes;
          notify(Events.MESSAGE);
        },
      };

      const originalConversationId = conversation.id;
      return client
        .sendMessage(originalConversationId, query, enhancedOptions)
        .catch((error) => {
          removeMessageFromConversation(botMessage.id, originalConversationId);
          notify(Events.MESSAGE);
          throw error;
        })
        .then((response) => {
          // Update final bot message from response (handles both streaming and non-streaming)
          botMessage.answer = response.answer;
          botMessage.id = response.messageId || botMessage.id;
          if (response.additionalAttributes) {
            botMessage.additionalAttributes = response.additionalAttributes;
          }

          // Check if conversation ID changed and handle promotion
          if (response.conversationId) {
            handleConversationPromotion(
              originalConversationId,
              response.conversationId
            );
          }

          notify(Events.MESSAGE); // Final message update
          return response;
        })
        .finally(() => {
          state.messageInProgress = false;
          notify(Events.IN_PROGRESS);
        });
    } catch (error) {
      // Make sure to reset progress flag on any error
      state.messageInProgress = false;
      notify(Events.IN_PROGRESS);
      throw error;
    }
  }

  function getConversations(): Conversation<T>[] {
    const conversations = Object.values(state.conversations);
    conversations.sort((a, b) => {
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return conversations;
  }

  function getMessageInProgress() {
    return state.messageInProgress;
  }

  async function createNewConversation(force = false): Promise<IConversation> {
    // do not create new conversation if current conversation is empty
    const currentConversationId = getActiveConversationId();
    if (!force && getActiveConversationMessages().length === 0) {
      if (!currentConversationId) {
        state.activeConversationId = TEMP_CONVERSATION_ID;
        const tempConversation =
          initializeConversationState(TEMP_CONVERSATION_ID);
        notify(Events.ACTIVE_CONVERSATION);
        return tempConversation;
      }
      return state.conversations[currentConversationId];
    }

    const newConversation = await client.createNewConversation();
    initializeConversationState(newConversation.id);
    await setActiveConversationId(newConversation.id);

    // Lock all existing conversations when creating a new one
    Object.values(state.conversations).forEach((conversation) => {
      if (conversation.id !== newConversation.id) {
        conversation.locked = true;
      }
    });

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

  function isTemporaryConversation(): boolean {
    return isTemporaryConversationId(state.activeConversationId);
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
    isTemporaryConversation,
  };
}
