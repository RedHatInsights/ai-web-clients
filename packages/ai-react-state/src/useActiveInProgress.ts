import { useContext, useEffect, useReducer } from "react";
import { AIStateContext } from "./AiStateContext";
import { Events } from "@redhat-cloud-services/ai-client-state";

export function useInProgress() {
  const { getState, subscribe } = useContext(AIStateContext);
  const [{inProgress}, dispatch] = useReducer(() => ({inProgress: getState().getState().messageInProgress}), {inProgress: getState().getState().messageInProgress});
  useEffect(() => {
    const unsubscribe = subscribe(Events.IN_PROGRESS, dispatch);
    return () => {
      unsubscribe();
    };
  }, [getState, subscribe]);
  return inProgress;
}