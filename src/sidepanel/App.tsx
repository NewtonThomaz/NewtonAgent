import { useState } from 'react';
import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { Header } from './components/Header';
import { RunControls } from './components/RunControls';
import { SettingsView } from './components/SettingsView';
import { useAgent } from './hooks/useAgent';
import { useSettings } from './hooks/useSettings';

export function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');
  const agent = useAgent();
  const settingsHook = useSettings();

  const isBusy = agent.session.status === 'running' || agent.session.status === 'stopping';

  const handleSend = async (goal: string) => {
    try {
      await agent.startMission(goal, settingsHook.settings.maxSteps);
    } catch {
      // If error is related to missing API key, suggest going to settings
      if (!settingsHook.settings.apiKey) {
        setActiveTab('settings');
      }
    }
  };

  return (
    <>
      <Header
        currentTab={activeTab}
        onSelectTab={setActiveTab}
        onClear={agent.clearSession}
        hasLogs={agent.session.logs.length > 0}
      />

      {agent.error && (
        <aside className="msg-card msg-error" style={{ margin: '8px 12px 0 12px' }}>
          <p>{agent.error}</p>
        </aside>
      )}

      {activeTab === 'chat' ? (
        <>
          <ChatView logs={agent.session.logs} />

          <RunControls
            status={agent.session.status}
            step={agent.session.step}
            maxSteps={agent.session.maxSteps}
            onPause={agent.pauseMission}
            onResume={agent.resumeMission}
            onStop={agent.stopMission}
          />

          <Composer onSend={handleSend} disabled={isBusy} />
        </>
      ) : (
        <SettingsView {...settingsHook} />
      )}
    </>
  );
}
