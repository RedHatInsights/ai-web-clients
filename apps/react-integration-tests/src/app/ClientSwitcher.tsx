import { ClientTab } from './ClientTab';
import './client-switcher.css';

export interface ClientInfo {
  id: string;
  name: string;
  description: string;
}

export interface ClientSwitcherProps {
  clients: ClientInfo[];
  activeClient: string;
  onClientChange: (clientId: string) => void;
}

export const ClientSwitcher = ({
  clients,
  activeClient,
  onClientChange,
}: ClientSwitcherProps) => {
  return (
    <div className="client-switcher">
      <h2 className="client-switcher__title">Select AI Client</h2>
      <div className="client-switcher__tabs">
        {clients.map((client) => (
          <ClientTab
            key={client.id}
            id={client.id}
            name={client.name}
            description={client.description}
            isActive={activeClient === client.id}
            onClick={() => onClientChange(client.id)}
          />
        ))}
      </div>
    </div>
  );
};
