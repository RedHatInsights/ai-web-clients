import { useContext, useEffect, useReducer } from 'react';
import { AIStateContext } from './AiStateContext';
import { Events } from '@redhat-cloud-services/ai-client-state';

export function useConversations() {
  const { getState, subscribe } = useContext(AIStateContext);
  const [conversations, dispatch] = useReducer(() => {
    return [...getState().getConversations()];
  }, getState().getConversations());
  useEffect(() => {
    const unsubscribeConversation = subscribe(Events.CONVERSATIONS, dispatch);
    return () => {
      unsubscribeConversation();
    };
  }, [getState, subscribe]);

  return conversations;
}
