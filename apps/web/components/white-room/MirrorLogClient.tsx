'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  initializeDB,
  getActiveInferences,
  updateInference,
  type Inference,
} from '../../lib/white-room/db';

export function MirrorLogClient() {
  const [inferences, setInferences] = useState<Inference[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'confirmed' | 'discarded'>>({});

  // Initialize on mount
  useEffect(() => {
    async function init() {
      await initializeDB();
      await refreshInferences();
      setIsInitialized(true);
    }
    init();
  }, []);

  const refreshInferences = useCallback(async () => {
    const activeInferences = await getActiveInferences();
    setInferences(activeInferences);
  }, []);

  const handleFeedback = async (inference: Inference, isAccurate: boolean) => {
    if (!inference.id) return;

    const newStatus = isAccurate ? 'confirmed' : 'discarded';
    await updateInference(inference.id, newStatus);

    // Track feedback for UI
    setFeedbackGiven((prev) => ({
      ...prev,
      [inference.id!]: newStatus,
    }));

    // Refresh after a moment
    setTimeout(() => {
      refreshInferences();
    }, 1500);
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-gray-400 text-sm">...</div>
      </div>
    );
  }

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

      {/* Main content - sparse, centered */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Title */}
          <h1 className="text-gray-500 text-center mb-12 font-light">
            What I think I've noticed
          </h1>

          {/* Inferences list */}
          {inferences.length === 0 ? (
            <p className="text-gray-400 text-center text-sm italic">
              Nothing yet. Patterns take time.
            </p>
          ) : (
            <div className="space-y-10">
              {inferences.map((inference) => (
                <InferenceItem
                  key={inference.id}
                  inference={inference}
                  feedback={inference.id ? feedbackGiven[inference.id] : undefined}
                  onFeedback={handleFeedback}
                />
              ))}
            </div>
          )}

          {/* Footer note */}
          <p className="text-gray-300 text-center text-xs mt-16">
            These shape how I respond.
          </p>
        </div>
      </main>
    </div>
  );
}

interface InferenceItemProps {
  inference: Inference;
  feedback?: 'confirmed' | 'discarded';
  onFeedback: (inference: Inference, isAccurate: boolean) => void;
}

function InferenceItem({ inference, feedback, onFeedback }: InferenceItemProps) {
  const isConfirmed = inference.status === 'confirmed' || feedback === 'confirmed';
  const isDiscarded = feedback === 'discarded';

  return (
    <div className="text-center">
      {/* The inference text */}
      <p
        className={`text-gray-600 mb-4 transition-opacity duration-500 ${
          isDiscarded ? 'opacity-30 line-through' : ''
        }`}
      >
        "{inference.text}"
      </p>

      {/* Feedback buttons or status */}
      {isConfirmed ? (
        <span className="text-gray-400 text-sm">✓ confirmed</span>
      ) : isDiscarded ? (
        <span className="text-gray-300 text-sm">discarded</span>
      ) : inference.status === 'active' ? (
        <div className="flex justify-center gap-6">
          <button
            onClick={() => onFeedback(inference, true)}
            className="text-gray-400 text-sm hover:text-gray-600 transition-colors px-3 py-1 border border-gray-200 rounded hover:border-gray-400"
          >
            Accurate
          </button>
          <button
            onClick={() => onFeedback(inference, false)}
            className="text-gray-400 text-sm hover:text-gray-600 transition-colors px-3 py-1 border border-gray-200 rounded hover:border-gray-400"
          >
            Not accurate
          </button>
        </div>
      ) : null}

      {/* Divider */}
      <div className="mt-8 mx-auto w-24 h-px bg-gray-100" />
    </div>
  );
}

export default MirrorLogClient;
