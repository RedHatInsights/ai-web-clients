import { useContext } from 'react';
import { IAIClient } from '@redhat-cloud-services/ai-client-common';
import { AIStateContext } from './AiStateContext';

export function useClient<C extends IAIClient = IAIClient>(): C {
  const { getState } = useContext(AIStateContext);
  const stateManager = getState();
  return stateManager.getClient() as C;
}
