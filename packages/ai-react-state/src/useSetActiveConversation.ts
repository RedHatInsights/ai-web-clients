import { useContext } from 'react';
import { AIStateContext } from './AiStateContext';

export const useSetActiveConversation = () => {
  const { getState } = useContext(AIStateContext);
  return getState().setActiveConversationId;
};
