import { useMemo } from 'react';
import './app.scss';

import { IFDClient } from '@redhat-cloud-services/arh-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider, useMessages, useSendMessage } from '@redhat-cloud-services/ai-react-state';
import { Chatbot, ChatbotContent, ChatbotFooter, Message, MessageBar, MessageBox } from '@patternfly/chatbot';

const IntegratedChatbot = () => {
  const messages = useMessages();
  const sendMessage = useSendMessage();
  const handleSend = (message: string | number) => {
    sendMessage({
      id: '1',
      role: 'user',
      answer: `${message}`,
    }, {
      stream: true,
    });
  }


  return (
    <Chatbot>
      <ChatbotContent>
        <MessageBox>
          {messages.map((message) => (
            <Message key={message.id} role={message.role} avatar="https://placehold.co/40" content={message.answer} />
          ))}
        </MessageBox>
      </ChatbotContent>
      <ChatbotFooter>
        <MessageBar onSendMessage={handleSend} />
      </ChatbotFooter>
    </Chatbot>
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
      <div>
        <h1>
          <span> Hello there, </span>
          Welcome react-integration-tests 👋
        </h1>
        <IntegratedChatbot />
      </div>
    </AIStateProvider>
  );
}
export default App;

