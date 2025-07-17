import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import VanillaChatbotWrapper from './VanillaChatbotWrapper';
import { useEffect } from 'react';

const client = new LightspeedClient({
  baseUrl: 'http://localhost:8080',
  fetchFunction: (input, init) => {
    return fetch(input, init);
  },
});

const stateManager = createClientStateManager(client);


const IntegratedChatbot = () => {
  return (
    <VanillaChatbotWrapper />
  )
}

export const LightSpeedChatbot = () => {
  useEffect(() => {
    stateManager.init();
  }, []);
  return (
    <AIStateProvider stateManager={stateManager}>
      <IntegratedChatbot />
    </AIStateProvider>
  )
}