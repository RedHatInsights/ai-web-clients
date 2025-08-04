import { useContext } from 'react';
import { AIStateContext } from './AiStateContext';

export const useCreateNewConversation = () => {
  const { getState } = useContext(AIStateContext);
  return getState().createNewConversation;
};
