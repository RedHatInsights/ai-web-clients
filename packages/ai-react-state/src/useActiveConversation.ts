import { useContext, useEffect, useReducer } from 'react';
import { AIStateContext } from './AiStateContext';
import { Events } from '@redhat-cloud-services/ai-client-state';

export function useActiveConversation() {
  const { getState, subscribe } = useContext(AIStateContext);
  const [{ conversationId }, dispatch] = useReducer(
    () => ({ conversationId: getState().getState().activeConversationId }),
    { conversationId: getState().getState().activeConversationId }
  );
  useEffect(() => {
    const unsubscribe = subscribe(Events.ACTIVE_CONVERSATION, dispatch);
    return () => {
      unsubscribe();
    };
  }, [getState, subscribe]);

  if (!conversationId) {
    return undefined;
  }

  return getState().getState().conversations[conversationId];
}
