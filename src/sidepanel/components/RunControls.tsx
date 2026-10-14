import type { AgentStatus } from '../../shared/types';
import { PauseIcon, PlayIcon, StopIcon } from '../icons';

interface RunControlsProps {
  status: AgentStatus;
  step: number;
  maxSteps: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function RunControls({
  status,
  step,
  maxSteps,
  onPause,
  onResume,
  onStop,
}: RunControlsProps) {
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isStopping = status === 'stopping';

  const getStatusLabel = () => {
    switch (status) {
      case 'running':
        return `Executando (${step}/${maxSteps})`;
      case 'paused':
        return `Pausado (${step}/${maxSteps})`;
      case 'stopping':
        return 'Interrompendo...';
      case 'completed':
        return 'Concluído';
      case 'error':
        return 'Erro';
      case 'stopped':
        return 'Parado';
      case 'idle':
      default:
        return 'Pronto';
    }
  };

  return (
    <aside className="run-controls">
      <section className="status-indicator">
        <span className={`status-dot ${status}`} />
        <span>{getStatusLabel()}</span>
      </section>

      {(isRunning || isPaused || isStopping) && (
        <section className="control-btn-group">
          {isRunning && (
            <button
              type="button"
              className="btn-ctrl"
              onClick={onPause}
              title="Pausar execução"
            >
              <PauseIcon />
              <span>Pausar</span>
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              className="btn-ctrl"
              onClick={onResume}
              title="Continuar execução"
            >
              <PlayIcon />
              <span>Continuar</span>
            </button>
          )}

          <button
            type="button"
            className="btn-ctrl danger"
            onClick={onStop}
            disabled={isStopping}
            title="Parar imediatamente"
          >
            <StopIcon />
            <span>Parar</span>
          </button>
        </section>
      )}
    </aside>
  );
}
