import { useMemo } from 'react';
import { AnsibleLightspeedClient } from '@redhat-cloud-services/ansible-lightspeed-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import GenericPFChatbot from './GenericPFChatbot';

const AnsibleLightspeedChatbot = () => {
  const stateManager = useMemo(() => {
    const client = new AnsibleLightspeedClient({
      baseUrl: window.location.origin,
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

export default AnsibleLightspeedChatbot;
