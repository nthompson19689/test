'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  initializeDB,
  getSettings,
  updateSettings,
  getState,
  exportData,
  clearAllData,
  getDaysSinceStart,
  type WhiteRoomSettings,
  type WhiteRoomState,
} from '../../lib/white-room/db';

export function SettingsClient() {
  const [settings, setSettings] = useState<WhiteRoomSettings | null>(null);
  const [state, setState] = useState<WhiteRoomState | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [predictionsEnabled, setPredictionsEnabled] = useState(true);
  const [mirrorIntensity, setMirrorIntensity] = useState<'low' | 'medium' | 'high'>('medium');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [message, setMessage] = useState('');

  // Initialize on mount
  useEffect(() => {
    async function init() {
      await initializeDB();
      const [currentSettings, currentState] = await Promise.all([
        getSettings(),
        getState(),
      ]);
      setSettings(currentSettings);
      setState(currentState);
      setApiKey(currentSettings.apiKey || '');
      setPredictionsEnabled(currentSettings.predictionsEnabled);
      setMirrorIntensity(currentSettings.mirrorIntensity);
      setIsInitialized(true);
    }
    init();
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setMessage('');

    try {
      await updateSettings({
        apiKey: apiKey.trim() || null,
        predictionsEnabled,
        mirrorIntensity,
      });
      setMessage('Saved.');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setMessage('Failed to save.');
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, predictionsEnabled, mirrorIntensity]);

  const handleExport = useCallback(async () => {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `white-room-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleClear = useCallback(async () => {
    await clearAllData();
    setShowConfirmClear(false);
    window.location.href = '/white-room';
  }, []);

  if (!isInitialized || !settings || !state) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-gray-400 text-sm">...</div>
      </div>
    );
  }

  const days = getDaysSinceStart(state);

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col">
      {/* Back link */}
      <header className="absolute top-4 left-4 sm:top-6 sm:left-6">
        <Link
          href="/white-room"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          ←
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-12">
          {/* Title */}
          <h1 className="text-gray-500 text-center font-light">Settings</h1>

          {/* API Key */}
          <div className="space-y-2">
            <label className="block text-gray-500 text-sm">
              OpenAI API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-transparent border-b border-gray-200 focus:border-gray-400 outline-none text-gray-700 py-2 transition-colors"
            />
            <p className="text-gray-400 text-xs">
              Stored locally in your browser. Never sent to our servers.
            </p>
          </div>

          {/* Predictions toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-gray-500 text-sm">
                Predictions
              </label>
              <p className="text-gray-400 text-xs mt-1">
                Allow the creature to anticipate what you might do
              </p>
            </div>
            <button
              onClick={() => setPredictionsEnabled(!predictionsEnabled)}
              className={`w-12 h-6 rounded-full transition-colors ${
                predictionsEnabled ? 'bg-gray-400' : 'bg-gray-200'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  predictionsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Mirror intensity */}
          <div className="space-y-2">
            <label className="block text-gray-500 text-sm">
              Mirror Intensity
            </label>
            <p className="text-gray-400 text-xs mb-3">
              How directly the creature reflects your patterns
            </p>
            <div className="flex gap-4">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setMirrorIntensity(level)}
                  className={`px-4 py-2 text-sm border rounded transition-colors ${
                    mirrorIntensity === level
                      ? 'border-gray-400 text-gray-600'
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Save button */}
          <div className="text-center">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-2 text-sm border border-gray-300 rounded hover:border-gray-400 text-gray-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? '...' : 'Save'}
            </button>
            {message && (
              <p className="text-gray-400 text-sm mt-2">{message}</p>
            )}
          </div>

          {/* Divider */}
          <div className="mx-auto w-24 h-px bg-gray-100" />

          {/* Stats - subtle, not gamified */}
          <div className="text-center space-y-2">
            <p className="text-gray-400 text-sm">
              Room {state.roomNumber} · {days} day{days !== 1 ? 's' : ''} · {state.totalInteractions} exchange{state.totalInteractions !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Export & Clear */}
          <div className="flex justify-center gap-8">
            <button
              onClick={handleExport}
              className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
            >
              Export data
            </button>
            <button
              onClick={() => setShowConfirmClear(true)}
              className="text-gray-400 text-sm hover:text-red-500 transition-colors"
            >
              Clear everything
            </button>
          </div>
        </div>
      </main>

      {/* Clear confirmation modal */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-8 max-w-sm w-full shadow-lg">
            <p className="text-gray-600 text-center mb-6">
              This will erase everything. The room. The history. What I've learned.
              <br />
              <br />
              Are you certain?
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="px-6 py-2 text-sm border border-gray-300 rounded hover:border-gray-400 text-gray-600 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={handleClear}
                className="px-6 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsClient;
