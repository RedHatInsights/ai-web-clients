import { useContext, useEffect, useReducer } from 'react';
import { AIStateContext } from './AiStateContext';
import { Events, Message } from '@redhat-cloud-services/ai-client-state';

export function useMessages<
  T extends Record<string, unknown> = Record<string, unknown>
>() {
  const { getState } = useContext(AIStateContext);
  const [messages, dispatch] = useReducer(
    () => [...getState().getActiveConversationMessages()],
    getState().getActiveConversationMessages()
  );
  useEffect(() => {
    const subscribe = getState().subscribe;
    const unsubscribeMessages = subscribe(Events.MESSAGE, dispatch);
    const unsubscribeConversation = subscribe(
      Events.ACTIVE_CONVERSATION,
      dispatch
    );
    return () => {
      unsubscribeMessages();
      unsubscribeConversation();
    };
  }, [getState]);
  return messages as Message<T>[];
}
