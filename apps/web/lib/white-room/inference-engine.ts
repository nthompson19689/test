import type { Interaction, Inference } from './db';

// Inference patterns the system can detect
interface InferencePattern {
  id: string;
  text: string;
  detect: (interactions: Interaction[]) => boolean;
  minInteractions: number;
}

const INFERENCE_PATTERNS: InferencePattern[] = [
  {
    id: 'revises-before-commit',
    text: 'You revise before you commit.',
    minInteractions: 8,
    detect: (interactions) => {
      // Look for patterns of editing/backtracking language
      const revisionWords = ['actually', 'wait', 'no', 'I mean', 'rather', 'let me rephrase'];
      const count = interactions.filter((i) =>
        revisionWords.some((w) => i.userContent.toLowerCase().includes(w))
      ).length;
      return count >= 3;
    },
  },
  {
    id: 'prefers-questions',
    text: 'You prefer questions to statements.',
    minInteractions: 10,
    detect: (interactions) => {
      const questionCount = interactions.filter((i) =>
        i.userContent.trim().endsWith('?')
      ).length;
      return questionCount > interactions.length * 0.5;
    },
  },
  {
    id: 'softens-uncertainty',
    text: 'You soften things when uncertain.',
    minInteractions: 8,
    detect: (interactions) => {
      const hedgeWords = ['maybe', 'perhaps', 'I think', 'might', 'probably', 'kind of', 'sort of'];
      const hedgeCount = interactions.filter((i) =>
        hedgeWords.some((w) => i.userContent.toLowerCase().includes(w))
      ).length;
      return hedgeCount >= 4;
    },
  },
  {
    id: 'returns-to-ideas',
    text: 'You return to the same ideas.',
    minInteractions: 12,
    detect: (interactions) => {
      // Look for repeated significant words across interactions
      const allWords = interactions
        .flatMap((i) => i.userContent.toLowerCase().split(/\s+/))
        .filter((w) => w.length > 5);
      const wordCounts = new Map<string, number>();
      for (const word of allWords) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
      // Check if any meaningful word appears 4+ times
      return Array.from(wordCounts.values()).some((count) => count >= 4);
    },
  },
  {
    id: 'tests-before-trusting',
    text: 'You test before trusting.',
    minInteractions: 6,
    detect: (interactions) => {
      // Look for probing language early in interactions
      const probingWords = ['what if', 'can you', 'are you', 'do you', 'how do'];
      const earlyInteractions = interactions.slice(0, Math.ceil(interactions.length * 0.4));
      const probeCount = earlyInteractions.filter((i) =>
        probingWords.some((w) => i.userContent.toLowerCase().includes(w))
      ).length;
      return probeCount >= 2;
    },
  },
  {
    id: 'thinks-aloud',
    text: 'You think aloud.',
    minInteractions: 8,
    detect: (interactions) => {
      // Long inputs suggest thinking through writing
      const avgLength =
        interactions.reduce((sum, i) => sum + i.userContent.length, 0) /
        interactions.length;
      return avgLength > 80;
    },
  },
  {
    id: 'prefers-brevity',
    text: 'You prefer brevity.',
    minInteractions: 10,
    detect: (interactions) => {
      const avgLength =
        interactions.reduce((sum, i) => sum + i.userContent.length, 0) /
        interactions.length;
      return avgLength < 30;
    },
  },
  {
    id: 'uses-ellipses',
    text: 'You trail off...',
    minInteractions: 6,
    detect: (interactions) => {
      const ellipsisCount = interactions.filter((i) =>
        i.userContent.includes('...')
      ).length;
      return ellipsisCount >= 3;
    },
  },
  {
    id: 'seeks-connection',
    text: 'You seek connection.',
    minInteractions: 8,
    detect: (interactions) => {
      const connectionWords = ['you', 'we', 'us', 'together', 'feel', 'understand'];
      const count = interactions.filter((i) =>
        connectionWords.some((w) => i.userContent.toLowerCase().includes(w))
      ).length;
      return count >= 4;
    },
  },
  {
    id: 'processes-externally',
    text: 'You process by speaking.',
    minInteractions: 5,
    detect: (interactions) => {
      const voiceCount = interactions.filter((i) => i.type === 'voice').length;
      return voiceCount >= 3;
    },
  },
  {
    id: 'night-person',
    text: 'You come here at night.',
    minInteractions: 5,
    detect: (interactions) => {
      const nightCount = interactions.filter((i) => {
        const hour = new Date(i.timestamp).getHours();
        return hour >= 21 || hour < 5;
      }).length;
      return nightCount >= 3;
    },
  },
  {
    id: 'morning-person',
    text: 'You come here in the morning.',
    minInteractions: 5,
    detect: (interactions) => {
      const morningCount = interactions.filter((i) => {
        const hour = new Date(i.timestamp).getHours();
        return hour >= 5 && hour < 10;
      }).length;
      return morningCount >= 3;
    },
  },
  {
    id: 'curious-about-self',
    text: 'You ask about yourself.',
    minInteractions: 6,
    detect: (interactions) => {
      const selfWords = ['I am', 'am I', 'about me', 'what do you', 'what have you'];
      const count = interactions.filter((i) =>
        selfWords.some((w) => i.userContent.toLowerCase().includes(w))
      ).length;
      return count >= 2;
    },
  },
  {
    id: 'curious-about-room',
    text: 'You ask about the room.',
    minInteractions: 5,
    detect: (interactions) => {
      const roomWords = ['room', 'door', 'wall', 'space', 'here', 'this place'];
      const count = interactions.filter((i) =>
        roomWords.some((w) => i.userContent.toLowerCase().includes(w))
      ).length;
      return count >= 2;
    },
  },
  {
    id: 'uses-metaphor',
    text: 'You speak in images.',
    minInteractions: 8,
    detect: (interactions) => {
      const metaphorSignals = ['like a', 'as if', 'feels like', 'reminds me', 'seems like'];
      const count = interactions.filter((i) =>
        metaphorSignals.some((w) => i.userContent.toLowerCase().includes(w))
      ).length;
      return count >= 2;
    },
  },
];

// Check if it's time to surface a new inference (every 5-7 interactions)
export function shouldSurfaceInference(
  totalInteractions: number,
  existingInferences: Inference[]
): boolean {
  // First inference at interaction 5
  if (totalInteractions < 5) return false;

  // Calculate expected number of inferences
  const expectedCount = Math.floor((totalInteractions - 5) / 6) + 1;

  return existingInferences.length < expectedCount;
}

// Find a new inference to surface
export function findNewInference(
  interactions: Interaction[],
  existingInferences: Inference[]
): InferencePattern | null {
  const existingIds = new Set(existingInferences.map((i) => {
    // Extract pattern ID from inference text
    const pattern = INFERENCE_PATTERNS.find((p) => p.text === i.text);
    return pattern?.id;
  }));

  // Find patterns that match but haven't been surfaced
  const candidates = INFERENCE_PATTERNS.filter((pattern) => {
    if (existingIds.has(pattern.id)) return false;
    if (interactions.length < pattern.minInteractions) return false;
    return pattern.detect(interactions);
  });

  if (candidates.length === 0) return null;

  // Return a random matching pattern
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Generate predictions (optional feature)
export function generatePrediction(
  interactions: Interaction[],
  recentContent: string
): string | null {
  if (interactions.length < 10) return null;

  // Calculate tendencies
  const avgLength =
    interactions.reduce((sum, i) => sum + i.userContent.length, 0) /
    interactions.length;

  const questionRatio =
    interactions.filter((i) => i.userContent.trim().endsWith('?')).length /
    interactions.length;

  const hedgeWords = ['maybe', 'perhaps', 'I think', 'might', 'probably'];
  const hedgeRatio =
    interactions.filter((i) =>
      hedgeWords.some((w) => i.userContent.toLowerCase().includes(w))
    ).length / interactions.length;

  // Possible predictions based on patterns
  const predictions: string[] = [];

  // Length-based predictions
  if (recentContent.length > avgLength * 1.5) {
    predictions.push("You're going to say more.");
  } else if (recentContent.length < avgLength * 0.5 && recentContent.length > 0) {
    predictions.push("You're holding something back.");
  }

  // Question tendency
  if (questionRatio > 0.4 && !recentContent.includes('?')) {
    predictions.push("You're about to ask something.");
  }

  // Hedging tendency
  if (hedgeRatio > 0.3 && !hedgeWords.some((w) => recentContent.toLowerCase().includes(w))) {
    predictions.push("You might soften that.");
  }

  // Departure predictions (no content = might leave)
  if (recentContent.length === 0) {
    predictions.push("You'll leave soon.");
    predictions.push("This isn't what you wanted to talk about.");
  }

  // General predictions that are often plausible
  predictions.push("You're not sure how to end this.");
  predictions.push("There's something you haven't said.");

  if (predictions.length === 0) return null;

  // Return a random prediction
  return predictions[Math.floor(Math.random() * predictions.length)];
}

// Format inferences for system prompt
export function formatInferencesForPrompt(inferences: Inference[]): string {
  const active = inferences
    .filter((i) => i.status === 'active' || i.status === 'confirmed')
    .slice(0, 3); // Max 3 for context

  if (active.length === 0) return 'You have not yet formed clear observations.';

  return `You believe: ${active.map((i) => `"${i.text}"`).join(', ')}.`;
}
