import { useEffect, useMemo, useRef } from 'react';
import './app.scss';

import { IFDClient } from '@redhat-cloud-services/arh-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider, useInProgress, useMessages, useSendMessage } from '@redhat-cloud-services/ai-react-state';
import { Chatbot, ChatbotContent, ChatbotFooter, Message, MessageBar, MessageBox } from '@patternfly/chatbot';

const IntegratedChatbot = () => {
  const messages = useMessages();
  const sendMessage = useSendMessage();
  const inProgress = useInProgress();
  const scrollToBottomRef = useRef<HTMLDivElement>(null);
  const handleSend = (message: string | number) => {
    sendMessage({
      id: '1',
      role: 'user',
      answer: `${message}`,
    }, {
      stream: true,
    });
  }

  useEffect(() => {
    if (scrollToBottomRef.current) {
      scrollToBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);


  return (
    <div id="ai-chatbot" aria-label="AI Assistant Chatbot">
      <Chatbot>
        <ChatbotContent>
          <MessageBox>
            {messages.map((message) => (
              <Message 
                id={`message-${message.id}`}
                role={message.role} 
                avatar="https://placehold.co/40" 
                content={message.answer}
                aria-label={`${message.role === 'user' ? 'Your message' : 'AI response'}: ${message.answer}`}
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
    </div>
  )
}


export function App() {
  const stateManager = useMemo(() => {
    const client = new IFDClient({
      baseUrl: 'http://localhost:3001',
      fetchFunction: (...args) => fetch(...args),
    })
    const stateManager = createClientStateManager(client);
    stateManager.init();
    return stateManager;
  }, []);
  return (
    <AIStateProvider stateManager={stateManager}>
      <div id="app-root">
        <h1 id="app-heading">
          <span> Hello there, </span>
          Welcome react-integration-tests 👋
        </h1>
        <IntegratedChatbot />
      </div>
    </AIStateProvider>
  );
}
export default App;

