import { useState, useMemo } from 'react';
import './app.scss';
import './client-switcher.css';

import { ARHVanillaChatbot } from './ARHVanillaChatbot';
import { ARHPatternFlyChatbot } from './ARHPatternFlyChatbot';
import { ARHPatternFlyReplica } from './ARHPatternFlyReplica';
import { LightSpeedChatbot } from './LightSpeedChatbot';
import { ClientSwitcher, ClientInfo } from './ClientSwitcher';

type ClientType =
  | 'arh-vanilla'
  | 'arh-patternfly'
  | 'arh-replica'
  | 'lightspeed';

export function App() {
  const [activeClient, setActiveClient] = useState<ClientType>('arh-vanilla');

  const clients: ClientInfo[] = [
    {
      id: 'arh-vanilla',
      name: 'ARH Vanilla JS',
      description: 'Vanilla JS wrapper using ARH client',
    },
    {
      id: 'arh-patternfly',
      name: 'ARH PatternFly',
      description: 'React PatternFly chatbot using ARH client',
    },
    {
      id: 'arh-replica',
      name: 'ARH PF Replica',
      description: 'Custom PatternFly replica using ARH client',
    },
    {
      id: 'lightspeed',
      name: 'Lightspeed',
      description: 'Vanilla JS wrapper using Lightspeed client',
    },
  ];

  const activeClientComponent = useMemo(() => {
    switch (activeClient) {
      case 'arh-vanilla':
        return <ARHVanillaChatbot />;
      case 'arh-patternfly':
        return <ARHPatternFlyChatbot />;
      case 'arh-replica':
        return <ARHPatternFlyReplica />;
      case 'lightspeed':
        return <LightSpeedChatbot />;
      default:
        return <ARHVanillaChatbot />;
    }
  }, [activeClient]);

  return (
    <div className="app-root">
      <h1 className="app-heading">
        <span>Hello there, </span>
        Welcome react-integration-tests
      </h1>

      <ClientSwitcher
        clients={clients}
        activeClient={activeClient}
        onClientChange={(clientId) => setActiveClient(clientId as ClientType)}
      />

      <div className="client-container">
        <div className="client-container__content">{activeClientComponent}</div>
      </div>
    </div>
  );
}
export default App;
