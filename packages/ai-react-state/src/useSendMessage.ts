import { useCallback, useContext, useMemo } from "react";
import { AIStateContext } from "./AiStateContext";

export function useSendMessage() {
  const { getState } = useContext(AIStateContext);
  const sendMessage = useMemo(() => getState().sendMessage, [getState]);
  return sendMessage;
}

export function useSendStreamMessage() {
  // This function is a wrapper around useSendMessage that sets the stream option to true
  // It is useful for components that need to send messages with streaming enabled
  // without having to specify the stream option every time.
  const sendMessage = useSendMessage();
  const sendMessageInternal = useCallback<typeof sendMessage>(
    (message, options) => {
      return sendMessage(message, { ...options, stream: true });
    },
    [sendMessage]
  );
  return sendMessageInternal;
}