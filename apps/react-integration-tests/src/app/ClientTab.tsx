import './client-switcher.css';

export interface ClientTabProps {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}

export const ClientTab = ({
  id,
  name,
  description,
  isActive,
  onClick,
}: ClientTabProps) => {
  return (
    <button
      key={id}
      onClick={onClick}
      className={`client-tab ${isActive ? 'client-tab--active' : ''}`}
      type="button"
      aria-pressed={isActive}
      aria-describedby={`${id}-description`}
    >
      <div className="client-tab__name">{name}</div>
      <div id={`${id}-description`} className="client-tab__description">
        {description}
      </div>
    </button>
  );
};
