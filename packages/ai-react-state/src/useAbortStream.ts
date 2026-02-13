import { useContext, useMemo } from 'react';
import { AIStateContext } from './AiStateContext';

export function useAbortStream() {
  const { getState } = useContext(AIStateContext);
  const abortStream = useMemo(() => getState().abortStream, [getState]);
  return abortStream;
}
