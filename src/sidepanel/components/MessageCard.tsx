import type { ChatLogEntry } from '../../shared/types';
import { AlertCircleIcon, BoltIcon, BrainIcon, CheckCircleIcon } from '../icons';

interface MessageCardProps {
  entry: ChatLogEntry;
}

export function MessageCard({ entry }: MessageCardProps) {
  const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const getBadge = () => {
    switch (entry.kind) {
      case 'user':
        return <span className="msg-badge">Usuário</span>;
      case 'thought':
        return (
          <span className="msg-badge">
            <BrainIcon /> Pensamento
          </span>
        );
      case 'action':
        return (
          <span className="msg-badge">
            <BoltIcon /> Ação
          </span>
        );
      case 'observe':
        return <span className="msg-badge">Observação</span>;
      case 'result':
        return <span className="msg-badge">Resultado</span>;
      case 'success':
        return (
          <span className="msg-badge">
            <CheckCircleIcon /> Sucesso
          </span>
        );
      case 'error':
        return (
          <span className="msg-badge">
            <AlertCircleIcon /> Erro
          </span>
        );
      case 'system':
      default:
        return <span className="msg-badge">Sistema</span>;
    }
  };

  return (
    <article className={`msg-card msg-${entry.kind}`}>
      <header className="msg-header">
        {getBadge()}
        <time className="msg-time" dateTime={new Date(entry.timestamp).toISOString()}>
          {timeStr}
        </time>
      </header>
      <p className="msg-content">{entry.text}</p>
    </article>
  );
}
