import { useEffect, useRef } from 'react';
import type { ChatLogEntry } from '../../shared/types';
import { EmptyState } from './EmptyState';
import { MessageCard } from './MessageCard';

interface ChatViewProps {
  logs: ChatLogEntry[];
}

export function ChatView({ logs }: ChatViewProps) {
  const bottomRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <section className="chat-section">
      {logs.length === 0 ? (
        <EmptyState />
      ) : (
        logs.map((log) => <MessageCard key={log.id} entry={log} />)
      )}
      <footer ref={bottomRef} style={{ height: '1px', opacity: 0 }} />
    </section>
  );
}
