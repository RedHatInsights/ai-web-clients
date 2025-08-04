import { PropsWithChildren, useCallback, useMemo } from 'react';
import { AIStateContext } from './AiStateContext';
import {
  createClientStateManager,
  Events,
  StateManager,
} from '@redhat-cloud-services/ai-client-state';
import { IAIClient } from '@redhat-cloud-services/ai-client-common';

export const AIStateProvider = ({
  children,
  stateManager,
  client,
}: PropsWithChildren<{
  stateManager?: StateManager;
  client?: IAIClient;
}>) => {
  const stateManagerInternal = useMemo(() => {
    if (stateManager && client) {
      console.warn(
        'AIStateProvider: Both stateManager and client provided. Using stateManager.'
      );
    }

    if (stateManager) {
      return stateManager;
    }

    if (client) {
      return createClientStateManager(client);
    }

    throw new Error(
      'AIStateProvider requires either a stateManager or a client'
    );
  }, [stateManager, client]);

  const getState = useCallback(
    () => stateManagerInternal,
    [stateManagerInternal]
  );
  const internalSubscribe = useCallback(
    (event: Events, callback: () => void) => {
      return stateManagerInternal.subscribe(event, callback);
    },
    [stateManagerInternal]
  );
  return (
    <AIStateContext.Provider value={{ getState, subscribe: internalSubscribe }}>
      {children}
    </AIStateContext.Provider>
  );
};
