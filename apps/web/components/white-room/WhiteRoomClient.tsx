'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Room } from './Room';
import {
  db,
  initializeDB,
  getState,
  updateState,
  addInteraction,
  getRecentInteractions,
  getActiveInferences,
  getSettings,
  type WhiteRoomState,
  type Interaction,
  type Inference,
  type WhiteRoomSettings,
} from '../../lib/white-room/db';
import {
  evaluateRoomAssets,
  calculateDoorProgress,
  calculateCreatureForm,
  getNewUnlocks,
} from '../../lib/white-room/room-logic';
import {
  shouldSurfaceInference,
  findNewInference,
} from '../../lib/white-room/inference-engine';
import { buildCreatureContext } from '../../lib/white-room/system-prompt';
import Link from 'next/link';

export function WhiteRoomClient() {
  // Core state
  const [state, setState] = useState<WhiteRoomState | null>(null);
  const [settings, setSettings] = useState<WhiteRoomSettings | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [inferences, setInferences] = useState<Inference[]>([]);

  // UI state
  const [input, setInput] = useState('');
  const [creatureResponse, setCreatureResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Calculated values
  const [doorProgress, setDoorProgress] = useState(0);
  const [roomAssets, setRoomAssets] = useState<string[]>([]);
  const [creatureForm, setCreatureForm] = useState(0);

  // Initialize on mount
  useEffect(() => {
    async function init() {
      await initializeDB();
      await refreshState();
      setIsInitialized(true);
    }
    init();
  }, []);

  // Refresh all state from DB
  const refreshState = useCallback(async () => {
    const [currentState, currentSettings, recentInteractions, activeInferences] =
      await Promise.all([
        getState(),
        getSettings(),
        getRecentInteractions(20),
        getActiveInferences(),
      ]);

    setState(currentState);
    setSettings(currentSettings);
    setInteractions(recentInteractions.reverse());
    setInferences(activeInferences);

    // Calculate derived state
    const confirmedInferences = activeInferences.filter(
      (i) => i.status === 'confirmed'
    );
    const newDoorProgress = calculateDoorProgress(
      currentState,
      recentInteractions,
      confirmedInferences
    );
    const newAssets = evaluateRoomAssets(
      currentState,
      recentInteractions,
      confirmedInferences
    );
    const newCreatureForm = calculateCreatureForm(currentState, recentInteractions);

    setDoorProgress(newDoorProgress);
    setRoomAssets(newAssets);
    setCreatureForm(newCreatureForm);

    // Update state if assets changed
    const newUnlocks = getNewUnlocks(currentState.roomAssets, newAssets);
    if (newUnlocks.length > 0) {
      await updateState({
        roomAssets: newAssets,
        doorProgress: newDoorProgress,
        creatureForm: newCreatureForm,
      });
    }

    return { currentState, recentInteractions, activeInferences, newDoorProgress };
  }, []);

  // Send message to creature
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !settings || isLoading) return;

    const userContent = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // Refresh state first
      const { currentState, recentInteractions, activeInferences, newDoorProgress } =
        await refreshState();

      // Build context for creature
      const context = buildCreatureContext(
        currentState,
        recentInteractions,
        activeInferences,
        newDoorProgress
      );

      // Call OpenAI
      const response = await fetch('/api/white-room/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          userMessage: userContent,
          apiKey: settings.apiKey,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      const creatureText = data.response || 'Noted.';

      // Save interaction
      await addInteraction({
        timestamp: Date.now(),
        type: 'text',
        userContent,
        creatureResponse: creatureText,
        wordCount: userContent.split(/\s+/).length,
        roomNumber: currentState.roomNumber,
      });

      // Display response
      setCreatureResponse(creatureText);

      // Check for new inferences
      const allInteractions = await db.interactions.toArray();
      if (shouldSurfaceInference(allInteractions.length, activeInferences)) {
        const newInference = findNewInference(allInteractions, activeInferences);
        if (newInference) {
          await db.inferences.add({
            text: newInference.text,
            status: 'active',
            surfacedAt: Date.now(),
            roomNumber: currentState.roomNumber,
          });
        }
      }

      // Refresh state after interaction
      await refreshState();
    } catch (error) {
      console.error('Error sending message:', error);
      setCreatureResponse('...');
    } finally {
      setIsLoading(false);
    }
  }, [input, settings, isLoading, refreshState]);

  // Handle enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Focus input on mount
  useEffect(() => {
    if (isInitialized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInitialized]);

  // Loading state
  if (!isInitialized || !state || !settings) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-gray-400 text-sm">...</div>
      </div>
    );
  }

  // No API key state
  if (!settings.apiKey) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <p className="text-gray-500 mb-6">
            WHITE ROOM requires an OpenAI API key to function.
          </p>
          <Link
            href="/white-room/settings"
            className="text-gray-600 underline underline-offset-4 hover:text-gray-800 transition-colors"
          >
            Configure settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col">
      {/* Header - minimal, top-right */}
      <header className="absolute top-4 right-4 sm:top-6 sm:right-6 flex gap-4 z-10">
        <Link
          href="/white-room/log"
          className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Log
        </Link>
        <Link
          href="/white-room/settings"
          className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Settings
        </Link>
      </header>

      {/* Main content - centered, vast white space */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        {/* The Room */}
        <div className="mb-8">
          <Room
            assets={roomAssets}
            doorProgress={doorProgress}
            creatureForm={creatureForm}
          />
        </div>

        {/* Creature response - single line, not a chat thread */}
        <div className="h-16 flex items-center justify-center mb-8 px-4">
          {isLoading ? (
            <span className="text-gray-400 text-sm">...</span>
          ) : creatureResponse ? (
            <p className="text-gray-600 text-center text-sm sm:text-base max-w-md leading-relaxed">
              "{creatureResponse}"
            </p>
          ) : state.totalInteractions === 0 ? (
            <p className="text-gray-400 text-center text-sm italic">
              A room. Empty. Waiting.
            </p>
          ) : null}
        </div>

        {/* Input area - minimal */}
        <div className="w-full max-w-lg px-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder=""
            disabled={isLoading}
            className="w-full bg-transparent border-b border-gray-200 focus:border-gray-400 outline-none resize-none text-gray-700 placeholder-gray-300 py-2 transition-colors text-center"
            rows={1}
            style={{
              minHeight: '2.5rem',
              maxHeight: '8rem',
            }}
          />

          {/* Subtle hint for new users */}
          {state.totalInteractions < 3 && input === '' && (
            <p className="text-gray-300 text-xs text-center mt-4">
              Say something. Or don't.
            </p>
          )}
        </div>
      </main>

      {/* Footer - invisible door progress indicator */}
      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="w-24 h-0.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-300 transition-all duration-1000"
            style={{ width: `${doorProgress}%` }}
          />
        </div>
      </footer>
    </div>
  );
}

export default WhiteRoomClient;
