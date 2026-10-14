import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { SendIcon } from '../icons';

interface ComposerProps {
  onSend: (goal: string) => Promise<void>;
  disabled: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const clean = goal.trim();
    if (!clean || disabled || submitting) return;

    setSubmitting(true);
    try {
      await onSend(clean);
      setGoal('');
    } catch {
      // Error is caught and surfaced by the parent
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <footer className="composer-footer">
      <form className="composer-form" onSubmit={handleSubmit}>
        <section className="composer-input-row">
          <textarea
            className="composer-textarea"
            placeholder={
              disabled
                ? 'Agente em execução...'
                : 'Defina a meta do agente para esta página (Enter para enviar)...'
            }
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || submitting}
            rows={2}
          />

          <button
            type="submit"
            className="btn-send"
            disabled={!goal.trim() || disabled || submitting}
            title="Iniciar missão"
          >
            <SendIcon />
            <span>Iniciar</span>
          </button>
        </section>
      </form>
    </footer>
  );
}
