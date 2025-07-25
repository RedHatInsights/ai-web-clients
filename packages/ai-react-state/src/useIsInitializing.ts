import { useContext, useEffect, useReducer } from "react";
import { AIStateContext } from "./AiStateContext";
import { Events } from "@redhat-cloud-services/ai-client-state";

export const useIsInitializing = () => {
  const { getState, subscribe } = useContext(AIStateContext);
  const [isInitializing, setIsInitializing] = useReducer(() => getState().isInitializing(), getState().isInitializing());
  useEffect(() => {
    const unsubscribe = subscribe(Events.INITIALIZING_MESSAGES, setIsInitializing);
    return () => {
      unsubscribe();
    };
  }, [subscribe, getState]);
  return isInitializing
}
