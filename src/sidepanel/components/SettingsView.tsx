import { useState } from 'react';
import type { useSettings } from '../hooks/useSettings';
import { BoltIcon, CheckCircleIcon } from '../icons';

type SettingsViewProps = ReturnType<typeof useSettings>;

export function SettingsView({
  settings,
  saving,
  testing,
  testResult,
  presets,
  updateSettings,
  applyPreset,
  save,
  testConnection,
}: SettingsViewProps) {
  const [showKey, setShowKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    await save();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <section className="settings-section">
      {/* Presets */}
      <fieldset className="settings-group">
        <legend className="settings-legend">Provedor &amp; Modelo (BYOK)</legend>

        <section className="form-field">
          <label className="field-label">Presets Rápidos:</label>
          <section className="preset-buttons">
            {presets.map((p) => {
              const active = settings.baseUrl === p.baseUrl && settings.model === p.model;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`btn-preset ${active ? 'active' : ''}`}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              );
            })}
          </section>
        </section>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-provider">
            Tipo de Provedor
          </label>
          <select
            id="setting-provider"
            className="select-input"
            value={settings.provider}
            onChange={(e) => updateSettings({ provider: e.target.value as 'openai' | 'gemini' })}
          >
            <option value="openai">OpenAI / NVIDIA NIM / Ollama</option>
            <option value="gemini">Google Gemini (API Nativa)</option>
          </select>
        </section>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-apikey">
            API Key
          </label>
          <section className="api-key-row">
            <input
              id="setting-apikey"
              type={showKey ? 'text' : 'password'}
              className="text-input"
              placeholder="Cole sua chave aqui (ex: nvapi-..., sk-...)"
              value={settings.apiKey}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
            />
            <button
              type="button"
              className="btn-action-secondary"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? 'Ocultar' : 'Ver'}
            </button>
          </section>
        </section>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-baseurl">
            Base URL
          </label>
          <input
            id="setting-baseurl"
            type="text"
            className="text-input"
            placeholder="https://integrate.api.nvidia.com/v1"
            value={settings.baseUrl}
            onChange={(e) => updateSettings({ baseUrl: e.target.value })}
          />
        </section>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-model">
            Model ID
          </label>
          <input
            id="setting-model"
            type="text"
            className="text-input"
            placeholder="nvidia/llama-3.1-nemotron-ultra-253b-v1"
            value={settings.model}
            onChange={(e) => updateSettings({ model: e.target.value })}
          />
        </section>
      </fieldset>

      {/* Execution params */}
      <fieldset className="settings-group">
        <legend className="settings-legend">Parâmetros do Agente</legend>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-maxsteps">
            Limite Máximo de Passos: <strong>{settings.maxSteps}</strong>
          </label>
          <input
            id="setting-maxsteps"
            type="range"
            min="5"
            max="100"
            step="1"
            value={settings.maxSteps}
            onChange={(e) => updateSettings({ maxSteps: Number(e.target.value) })}
          />
        </section>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-temp">
            Temperatura: <strong>{settings.temperature}</strong>
          </label>
          <input
            id="setting-temp"
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={settings.temperature}
            onChange={(e) => updateSettings({ temperature: Number(e.target.value) })}
          />
        </section>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-delay">
            Intervalo entre Ações: <strong>{settings.actionDelayMs}ms</strong>
          </label>
          <input
            id="setting-delay"
            type="range"
            min="100"
            max="2000"
            step="50"
            value={settings.actionDelayMs}
            onChange={(e) => updateSettings({ actionDelayMs: Number(e.target.value) })}
          />
        </section>

        <section className="toggle-row">
          <label className="field-label" htmlFor="setting-jsonmode">
            Modo JSON Estrito (response_format)
          </label>
          <input
            id="setting-jsonmode"
            type="checkbox"
            checked={settings.jsonMode}
            onChange={(e) => updateSettings({ jsonMode: e.target.checked })}
          />
        </section>

        <section className="toggle-row">
          <label className="field-label" htmlFor="setting-reasoning">
            Raciocínio Detalhado (Nemotron / Thinking)
          </label>
          <input
            id="setting-reasoning"
            type="checkbox"
            checked={settings.reasoning}
            onChange={(e) => updateSettings({ reasoning: e.target.checked })}
          />
        </section>

        <section className="form-field">
          <label className="field-label" htmlFor="setting-extra">
            Instruções Extras de Comportamento:
          </label>
          <textarea
            id="setting-extra"
            className="text-area-input"
            rows={3}
            placeholder="Ex: Responda em português, prefira alternativas mais formais..."
            value={settings.extraInstructions}
            onChange={(e) => updateSettings({ extraInstructions: e.target.value })}
          />
        </section>
      </fieldset>

      {/* Connection test result banner */}
      {testResult && (
        <article className={`msg-card ${testResult.ok ? 'msg-success' : 'msg-error'}`}>
          <p>{testResult.message}</p>
        </article>
      )}

      {saveSuccess && (
        <article className="msg-card msg-success">
          <p>Configurações salvas com sucesso no armazenamento local!</p>
        </article>
      )}

      {/* Action buttons */}
      <section className="settings-actions-row">
        <button
          type="button"
          className="btn-action-secondary"
          onClick={testConnection}
          disabled={testing || saving}
        >
          <BoltIcon />
          <span>{testing ? 'Testando...' : 'Testar Conexão'}</span>
        </button>

        <button
          type="button"
          className="btn-action-primary"
          onClick={handleSave}
          disabled={saving || testing}
        >
          <CheckCircleIcon />
          <span>{saving ? 'Salvando...' : 'Salvar'}</span>
        </button>
      </section>
    </section>
  );
}
