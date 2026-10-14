import { useCallback, useEffect, useRef, useState } from 'react';
import { PORT_NAME, createInitialSession } from '../../shared/constants';
import { isBackgroundEvent } from '../../shared/messages';
import type { SessionState } from '../../shared/types';
import { getTargetTab, sendToBackground } from '../lib/runtime';

export function useAgent() {
  const [session, setSession] = useState<SessionState>(() => createInitialSession());
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // Connect port for real-time background streaming
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let isDisposed = false;

    function connect() {
      if (isDisposed) return;
      try {
        const port = chrome.runtime.connect({ name: PORT_NAME });
        portRef.current = port;

        port.onMessage.addListener((msg: unknown) => {
          if (!isBackgroundEvent(msg)) return;

          if (msg.type === 'BG/STATE') {
            setSession(msg.state);
          } else if (msg.type === 'BG/LOG') {
            setSession((prev) => {
              // Avoid duplicates if already present
              if (prev.logs.some((l) => l.id === msg.entry.id)) return prev;
              return {
                ...prev,
                logs: [...prev.logs, msg.entry],
              };
            });
          } else if (msg.type === 'BG/STATUS') {
            setSession((prev) => ({
              ...prev,
              status: msg.status,
              step: msg.step,
              maxSteps: msg.maxSteps,
            }));
          }
        });

        port.onDisconnect.addListener(() => {
          portRef.current = null;
          if (!isDisposed) {
            reconnectTimer = setTimeout(connect, 1000);
          }
        });
      } catch {
        if (!isDisposed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      }
    }

    connect();

    // Initial state fetch
    sendToBackground({ type: 'PANEL/GET_STATE' })
      .then((state) => setSession(state))
      .catch((err) => console.warn('[NewtonAgent] fetch state failed', err));

    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimer);
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, []);

  const startMission = useCallback(async (goal: string, maxSteps?: number) => {
    setError(null);
    try {
      const tab = await getTargetTab();
      if (!tab.id) {
        throw new Error('Não foi possível identificar a aba alvo.');
      }
      await sendToBackground({
        type: 'PANEL/START',
        goal,
        tabId: tab.id,
        maxSteps,
      });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      throw err;
    }
  }, []);

  const pauseMission = useCallback(async () => {
    try {
      await sendToBackground({ type: 'PANEL/PAUSE' });
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const resumeMission = useCallback(async () => {
    try {
      await sendToBackground({ type: 'PANEL/RESUME' });
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const stopMission = useCallback(async () => {
    try {
      await sendToBackground({ type: 'PANEL/STOP' });
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const clearSession = useCallback(async () => {
    try {
      const clean = await sendToBackground({ type: 'PANEL/CLEAR' });
      setSession(clean);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  return {
    session,
    error,
    startMission,
    pauseMission,
    resumeMission,
    stopMission,
    clearSession,
  };
}
