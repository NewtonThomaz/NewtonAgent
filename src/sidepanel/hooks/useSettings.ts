import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, PROVIDER_PRESETS, type ProviderPreset } from '../../shared/constants';
import type { AgentSettings } from '../../shared/types';
import { sendToBackground } from '../lib/runtime';

export function useSettings() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    sendToBackground({ type: 'PANEL/GET_SETTINGS' })
      .then((s) => setSettings(s))
      .catch((err) => console.warn('[NewtonAgent] load settings failed', err))
      .finally(() => setLoading(false));
  }, []);

  const updateSettings = useCallback((patch: Partial<AgentSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setTestResult(null);
  }, []);

  const applyPreset = useCallback((preset: ProviderPreset) => {
    setSettings((prev) => ({
      ...prev,
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      model: preset.model,
    }));
    setTestResult(null);
  }, []);

  const save = useCallback(async (newSettings = settings) => {
    setSaving(true);
    try {
      const saved = await sendToBackground({ type: 'PANEL/SAVE_SETTINGS', settings: newSettings });
      setSettings(saved);
      return saved;
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendToBackground({ type: 'PANEL/TEST_CONNECTION', settings });
      setTestResult({
        ok: true,
        message: `Sucesso! Latência: ${res.latencyMs}ms · Modelo respondeu: "${res.sample}"`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: `Falha no teste: ${(err as Error).message}`,
      });
    } finally {
      setTesting(false);
    }
  }, [settings]);

  return {
    settings,
    loading,
    saving,
    testing,
    testResult,
    presets: PROVIDER_PRESETS,
    updateSettings,
    applyPreset,
    save,
    testConnection,
  };
}
