import { useMemo } from 'react';
import { IFDClient } from '@redhat-cloud-services/arh-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import { PatternFlyChatbotReplica } from './PatternFlyChatbotReplica';

export const ARHPatternFlyReplica = () => {
  const stateManager = useMemo(() => {
    const client = new IFDClient({
      baseUrl: 'http://localhost:3001',
      fetchFunction: (...args) => fetch(...args),
    });
    const stateManager = createClientStateManager(client);
    stateManager.init();
    return stateManager;
  }, []);

  return (
    <AIStateProvider stateManager={stateManager}>
      <PatternFlyChatbotReplica
        containerStyle={{
          position: 'relative',
          width: '100%',
          height: '500px',
          border: '1px solid var(--pf-t--global--border--color--default)',
          borderRadius: '8px',
          backgroundColor: 'white',
          zIndex: 10,
        }}
        className="custom-chatbot-replica"
      />
    </AIStateProvider>
  );
};
