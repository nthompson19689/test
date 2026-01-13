import type { WhiteRoomState, Interaction, Inference } from './db';
import { getDaysSinceStart } from './db';

// Room assets - these unlock based on behavior, not just time
export type RoomAsset =
  | 'floor-plane'
  | 'first-shadow'
  | 'room-depth'
  | 'deep-shadow'
  | 'first-object'
  | 'second-object'
  | 'room-texture'
  | 'door-seam'
  | 'door-shadow'
  | 'door-handle'
  | 'door-visible'
  | 'door-open'
  | 'atmosphere';

// Door progress stages
export const DOOR_STAGES = {
  NOTHING: 0,
  SEAM: 20,
  SHADOW: 40,
  HANDLE: 60,
  VISIBLE: 80,
  OPEN: 100,
} as const;

// Evaluate what assets should be visible based on state and interactions
export function evaluateRoomAssets(
  state: WhiteRoomState,
  interactions: Interaction[],
  confirmedInferences: Inference[]
): string[] {
  const unlocks: string[] = [];
  const days = getDaysSinceStart(state);

  // Calculate average input length for "depth" unlocks
  const avgLength =
    interactions.length > 0
      ? interactions.reduce((sum, i) => sum + i.userContent.length, 0) /
        interactions.length
      : 0;

  // Count voice interactions
  const voiceCount = interactions.filter((i) => i.type === 'voice').length;

  // Presence unlocks (time-based, cannot be rushed)
  if (days >= 1 || state.totalInteractions >= 1) unlocks.push('floor-plane');
  if (days >= 3) unlocks.push('first-shadow');

  // Depth unlocks (interaction quality - longer, more thoughtful inputs)
  if (avgLength > 50) unlocks.push('room-depth');
  if (avgLength > 100) unlocks.push('deep-shadow');

  // Accumulation unlocks (quantity of engagement)
  if (state.totalInteractions >= 10) unlocks.push('first-object');
  if (state.totalInteractions >= 25) unlocks.push('second-object');

  // Voice unlocks (modality - voice interactions add texture)
  if (voiceCount >= 3) unlocks.push('room-texture');

  // Atmosphere unlock (sustained engagement)
  if (state.totalInteractions >= 40 && days >= 7) unlocks.push('atmosphere');

  // Door progression (the central mystery)
  if (days >= 5 || state.totalInteractions >= 15) unlocks.push('door-seam');
  if (days >= 6 || state.totalInteractions >= 20) unlocks.push('door-shadow');
  if (days >= 7 || state.totalInteractions >= 25) unlocks.push('door-handle');
  if (days >= 10 || state.totalInteractions >= 30) unlocks.push('door-visible');

  // The door opens - requires multiple conditions (cannot be rushed)
  const doorCanOpen =
    days >= 14 &&
    state.totalInteractions >= 25 &&
    confirmedInferences.length >= 5;

  if (doorCanOpen) unlocks.push('door-open');

  return unlocks;
}

// Calculate door progress percentage (0-100)
export function calculateDoorProgress(
  state: WhiteRoomState,
  interactions: Interaction[],
  confirmedInferences: Inference[]
): number {
  const days = getDaysSinceStart(state);

  // Day progress (0-50): 14 days needed, each day is ~3.5%
  const dayProgress = Math.min(50, (days / 14) * 50);

  // Interaction progress (0-30): 25 interactions needed
  const interactionProgress = Math.min(
    30,
    (state.totalInteractions / 25) * 30
  );

  // Inference progress (0-20): 5 confirmed inferences needed
  const inferenceProgress = Math.min(
    20,
    (confirmedInferences.length / 5) * 20
  );

  return Math.min(100, Math.floor(dayProgress + interactionProgress + inferenceProgress));
}

// Get the current door state description
export function getDoorState(progress: number): string {
  if (progress >= 100) return 'open';
  if (progress >= 80) return 'visible';
  if (progress >= 60) return 'handle-shadow';
  if (progress >= 40) return 'deepening-shadow';
  if (progress >= 20) return 'seam';
  return 'nothing';
}

// Creature form evolution (0-5 based on total engagement)
export function calculateCreatureForm(
  state: WhiteRoomState,
  interactions: Interaction[]
): number {
  const days = getDaysSinceStart(state);
  const avgLength =
    interactions.length > 0
      ? interactions.reduce((sum, i) => sum + i.userContent.length, 0) /
        interactions.length
      : 0;

  let form = 0;

  // Form evolves based on sustained engagement and depth
  if (state.totalInteractions >= 3) form = 1;
  if (state.totalInteractions >= 10 && days >= 2) form = 2;
  if (state.totalInteractions >= 20 && days >= 5) form = 3;
  if (state.totalInteractions >= 35 && days >= 10 && avgLength > 50) form = 4;
  if (state.totalInteractions >= 50 && days >= 14 && avgLength > 75) form = 5;

  return form;
}

// Check for new room unlocks (returns newly unlocked assets)
export function getNewUnlocks(
  currentAssets: string[],
  newAssets: string[]
): string[] {
  return newAssets.filter((asset) => !currentAssets.includes(asset));
}

// Format room state for system prompt context
export function formatRoomContext(
  state: WhiteRoomState,
  doorProgress: number
): string {
  const days = getDaysSinceStart(state);
  const doorState = getDoorState(doorProgress);

  const assetDescriptions: Record<string, string> = {
    'floor-plane': 'a floor plane establishing depth',
    'first-shadow': 'a sourceless shadow',
    'room-depth': 'recesses and corners',
    'deep-shadow': 'deep shadows suggesting unseen space',
    'first-object': 'a single ambiguous object',
    'second-object': 'another shape, perhaps furniture',
    'room-texture': 'texture and grain in the surfaces',
    atmosphere: 'subtle atmospheric light shifts',
  };

  const visibleAssets = state.roomAssets
    .filter((a) => assetDescriptions[a])
    .map((a) => assetDescriptions[a]);

  const doorDescriptions: Record<string, string> = {
    nothing: 'There is no door yet.',
    seam: 'There is a faint vertical seam in one wall.',
    'deepening-shadow': 'The seam has deepened. A shadow suggests depth.',
    'handle-shadow': 'A handle-shaped shadow is visible.',
    visible: 'There is unmistakably a door. It remains closed.',
    open: 'The door is open. Another room waits.',
  };

  return `The user has been here ${days} day${days !== 1 ? 's' : ''}.
The room contains: ${visibleAssets.length > 0 ? visibleAssets.join(', ') : 'only emptiness'}.
${doorDescriptions[doorState]}`;
}
