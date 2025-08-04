import { createContext } from 'react';
import {} from '@redhat-cloud-services/ai-client-common';
import type {
  Events,
  StateManager,
} from '@redhat-cloud-services/ai-client-state';

export const AIStateContext = createContext<{
  getState: () => StateManager;
  subscribe: (event: Events, callback: () => void) => () => void;
}>({
  getState: () => {
    throw new Error('AIStateContext not initialized');
  },
  subscribe: () => {
    throw new Error('AIStateContext not initialized');
  },
});
