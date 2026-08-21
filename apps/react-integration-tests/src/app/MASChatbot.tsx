import { useMemo } from 'react';
import { MASClient } from '@redhat-cloud-services/mas-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import GenericPFChatbot from './GenericPFChatbot';

const MASChatbot = () => {
  const stateManager = useMemo(() => {
    const client = new MASClient({
      baseUrl: 'http://localhost:3006',
      blueprintId: 'test-blueprint-123',
      fetchFunction: (...args) => fetch(...args),
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

export default MASChatbot;
