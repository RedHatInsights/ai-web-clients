import {
  Chatbot,
  ChatbotContent,
  ChatbotDisplayMode,
  ChatbotFooter,
  Message,
  MessageBar,
  MessageBox,
} from '@patternfly/chatbot';
import {
  useInProgress,
  useMessages,
  useSendMessage,
  useStreamChunk,
} from '@redhat-cloud-services/ai-react-state';
import { useEffect, useRef } from 'react';

const GenericPFChatbot = ({
  sendMessageOptions,
}: {
  sendMessageOptions?: Record<string, unknown>;
}) => {
  const messages = useMessages();
  const sendMessage = useSendMessage();
  const inProgress = useInProgress();
  const scrollToBottomRef = useRef<HTMLDivElement>(null);
  const lastChunk = useStreamChunk();

  const handleSend = (message: string | number) => {
    sendMessage(`${message}`, {
      stream: true,
      ...sendMessageOptions,
    });
  };

  useEffect(() => {
    if (scrollToBottomRef.current) {
      scrollToBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div id="ai-chatbot" aria-label="AI Assistant Chatbot">
      <Chatbot displayMode={ChatbotDisplayMode.embedded}>
        <ChatbotContent>
          <MessageBox>
            {messages.map((message) => (
              <Message
                key={message.id}
                id={`message-${message.id}`}
                role={message.role}
                avatar="https://placehold.co/40"
                content={message.answer}
                isLoading={
                  message.role === 'bot' && message.answer.length === 0
                }
                aria-label={`${
                  message.role === 'user' ? 'Your message' : 'AI response'
                }: ${message.answer}`}
              />
            ))}
            <div ref={scrollToBottomRef}></div>
          </MessageBox>
        </ChatbotContent>
        <ChatbotFooter>
          <MessageBar
            id="query-input"
            onSendMessage={handleSend}
            aria-label="Type your message to the AI assistant"
            alwayShowSendButton
            isSendButtonDisabled={inProgress}
            hasAttachButton={false}
          />
        </ChatbotFooter>
      </Chatbot>
      <div>
        {lastChunk ? (
          <p>Last streamed chunk: {JSON.stringify(lastChunk, null, 2)}</p>
        ) : null}
      </div>
    </div>
  );
};

export default GenericPFChatbot;
