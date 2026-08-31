import { useMemo } from 'react';
import { MASClient } from '@redhat-cloud-services/mas-client';
import type { MASAdditionalAttributes } from '@redhat-cloud-services/mas-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import { useStreamChunk } from '@redhat-cloud-services/ai-react-state';
import GenericPFChatbot from './GenericPFChatbot';

const statusLabel: Record<string, string> = {
  running: '⟳ Running',
  done: '✓ Done',
  error: '✗ Error',
};

const AgentStatusPanel = () => {
  const chunk = useStreamChunk<MASAdditionalAttributes>();
  const agents = chunk?.additionalAttributes?.activeAgents;

  if (!agents || agents.length === 0) return null;

  return (
    <div className="mas-agent-panel">
      <span className="mas-agent-panel__label">Active agents:</span>
      <ul className="mas-agent-panel__list">
        {agents.map((agent) => (
          <li
            key={agent.nodeId}
            className={`mas-agent-panel__item mas-agent-panel__item--${agent.status}`}
          >
            {statusLabel[agent.status] ?? agent.status} {agent.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

const MASChatbotInner = () => (
  <>
    <AgentStatusPanel />
    <GenericPFChatbot />
  </>
);

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
      <MASChatbotInner />
    </AIStateProvider>
  );
};

export default MASChatbot;
