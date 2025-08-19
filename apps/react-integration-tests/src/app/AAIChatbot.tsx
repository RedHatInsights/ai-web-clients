import { useMemo } from 'react';
import { AAIClient } from '@redhat-cloud-services/aai-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import GenericPFChatbot from './GenericPFChatbot';

const AAIChatbot = () => {
  const stateManager = useMemo(() => {
    const client = new AAIClient({
      baseUrl: 'http://localhost:3004',
      fetchFunction: (...args) => fetch(...args),
    });
    const stateManager = createClientStateManager(client);
    stateManager.init();
    return stateManager;
  }, []);
  return (
    <AIStateProvider stateManager={stateManager}>
      <GenericPFChatbot
        sendMessageOptions={{
          requestBody: {
            model: 'gemini/gemini-2.5-flash',
            provider: 'gemini',
            media_type: 'application/json',
          },
        }}
      />
    </AIStateProvider>
  );
};

export default AAIChatbot;
