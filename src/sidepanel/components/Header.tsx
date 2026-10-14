import { ChatIcon, SettingsIcon, TrashIcon } from '../icons';

interface HeaderProps {
  currentTab: 'chat' | 'settings';
  onSelectTab: (tab: 'chat' | 'settings') => void;
  onClear: () => void;
  hasLogs: boolean;
}

export function Header({ currentTab, onSelectTab, onClear, hasLogs }: HeaderProps) {
  return (
    <header className="app-header">
      <section className="header-brand">
        <span className="brand-icon">
          <img src="./icons/logo.png" alt="NewtonAgent Logo" className="brand-logo-img" />
        </span>
        <h1 className="brand-title">NewtonAgent</h1>
      </section>

      <nav className="header-nav">
        <button
          type="button"
          className={`nav-tab ${currentTab === 'chat' ? 'active' : ''}`}
          onClick={() => onSelectTab('chat')}
          title="Ver o Chat do Agente"
        >
          <ChatIcon />
          <span>Chat</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${currentTab === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectTab('settings')}
          title="Configurações e Chaves BYOK"
        >
          <SettingsIcon />
          <span>Config</span>
        </button>

        {hasLogs && currentTab === 'chat' && (
          <button
            type="button"
            className="nav-tab"
            onClick={onClear}
            title="Limpar histórico do chat"
          >
            <TrashIcon />
          </button>
        )}
      </nav>
    </header>
  );
}
