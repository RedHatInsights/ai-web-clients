import { IStreamChunk } from '@redhat-cloud-services/ai-client-common';
import { useContext, useEffect, useReducer } from 'react';
import { AIStateContext } from './AiStateContext';
import { Events } from '@redhat-cloud-services/ai-client-state';

export function useStreamChunk<
  T extends Record<string, unknown> = Record<string, unknown>
>() {
  const { subscribe, getState } = useContext(AIStateContext);
  const [chunk, dispatch] = useReducer(() => {
    // no need to create new object reference as we only care about identity change
    return getState().getActiveConversationStreamChunk();
  }, getState().getActiveConversationStreamChunk());

  useEffect(() => {
    const unsubscribe = subscribe(Events.STREAM_CHUNK, dispatch);
    return () => {
      unsubscribe();
    };
  }, [subscribe]);
  return chunk as IStreamChunk<T>;
}
