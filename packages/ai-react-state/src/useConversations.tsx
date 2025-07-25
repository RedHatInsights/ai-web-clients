import { useContext, useEffect, useReducer } from "react";
import { AIStateContext } from "./AiStateContext";
import { Events } from "@redhat-cloud-services/ai-client-state";

export function useConversations() {
  const { getState } = useContext(AIStateContext);
  const [conversations, dispatch] = useReducer(() => [...getState().getConversations()], getState().getConversations());
  useEffect(() => {
    const subscribe = getState().subscribe;
    const unsubscribeConversation = subscribe(Events.CONVERSATIONS, dispatch);
    return () => {
        unsubscribeConversation();
      };
    }, [getState]);
  
  return conversations;
}