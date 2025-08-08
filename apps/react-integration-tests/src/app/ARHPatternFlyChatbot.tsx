import { useMemo } from 'react';
import { IFDClient } from '@redhat-cloud-services/arh-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import GenericPFChatbot from './GenericPFChatbot';

export const ARHPatternFlyChatbot = () => {
  const stateManager = useMemo(() => {
    const client = new IFDClient({
      baseUrl: 'http://localhost:3001',
      fetchFunction: (...args) => fetch(...args),
      initOptions: {
        initializeNewConversation: false,
      },
    });
    const stateManager = createClientStateManager(client);
    stateManager.init();
    return stateManager;
  }, []);

  return (
    <AIStateProvider stateManager={stateManager}>
      <GenericPFChatbot />
    </AIStateProvider>
  );
};
