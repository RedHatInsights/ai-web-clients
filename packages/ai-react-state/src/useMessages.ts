import { useContext, useEffect, useReducer } from "react";
import { AIStateContext } from "./AiStateContext";
import { Events } from "@redhat-cloud-services/ai-client-state";

export function useMessages() {
  const { getState } = useContext(AIStateContext);
  const [messages, dispatch] = useReducer(() => [...getState().getActiveConversationMessages()], getState().getActiveConversationMessages());
  useEffect(() => {
    const subscribe = getState().subscribe;
    const unsubscribeMessages = subscribe(Events.MESSAGE, dispatch);
    const unsubscribeConversation = subscribe(Events.ACTIVE_CONVERSATION, dispatch);
    return () => {
      unsubscribeMessages();
      unsubscribeConversation();
    };
  }, [getState]);
  return messages;
}