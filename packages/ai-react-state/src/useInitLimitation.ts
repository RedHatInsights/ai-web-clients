import { useContext, useEffect, useReducer } from 'react';
import { AIStateContext } from './AiStateContext';
import { Events } from '@redhat-cloud-services/ai-client-state';

export function useInitLimitation() {
  const { getState, subscribe } = useContext(AIStateContext);
  const [limitations, dispatch] = useReducer(() => {
    const limitation = getState().getInitLimitation();
    if (!limitation) {
      return undefined;
    }
    return { ...getState().getInitLimitation() };
  }, getState().getInitLimitation());

  useEffect(() => {
    const unsubscribe = subscribe(Events.INIT_LIMITATION, () => {
      dispatch();
    });
    return () => {
      unsubscribe();
    };
  }, [subscribe, dispatch]);

  return limitations;
}
