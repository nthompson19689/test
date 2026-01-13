import Dexie, { type Table } from 'dexie';

// Types aligned with V2 design - simplified, no gamification
export interface WhiteRoomState {
  id: 'singleton'; // Always 'singleton' - single state record
  roomNumber: number;
  firstInteractionAt: number; // timestamp
  totalInteractions: number;
  doorProgress: number; // 0-100
  roomAssets: string[]; // IDs of visible assets
  creatureForm: number; // 0-5, visual evolution
  updatedAt: number;
}

export interface Interaction {
  id?: number; // auto-increment
  timestamp: number;
  type: 'text' | 'voice';
  userContent: string;
  creatureResponse: string;
  wordCount: number;
  roomNumber: number;
}

export interface Inference {
  id?: number;
  text: string;
  status: 'active' | 'confirmed' | 'discarded';
  surfacedAt: number;
  roomNumber: number;
}

export interface WhiteRoomSettings {
  id: 'singleton';
  apiKey: string | null;
  predictionsEnabled: boolean;
  mirrorIntensity: 'low' | 'medium' | 'high';
}

class WhiteRoomDB extends Dexie {
  state!: Table<WhiteRoomState>;
  interactions!: Table<Interaction>;
  inferences!: Table<Inference>;
  settings!: Table<WhiteRoomSettings>;

  constructor() {
    super('WhiteRoomDB');
    this.version(1).stores({
      state: 'id',
      interactions: '++id, timestamp, roomNumber',
      inferences: '++id, status, roomNumber',
      settings: 'id',
    });
  }
}

export const db = new WhiteRoomDB();

// Initialize with defaults if not exists
export async function initializeDB(): Promise<void> {
  const existingState = await db.state.get('singleton');
  if (!existingState) {
    await db.state.put({
      id: 'singleton',
      roomNumber: 1,
      firstInteractionAt: 0,
      totalInteractions: 0,
      doorProgress: 0,
      roomAssets: [],
      creatureForm: 0,
      updatedAt: Date.now(),
    });
  }

  const existingSettings = await db.settings.get('singleton');
  if (!existingSettings) {
    await db.settings.put({
      id: 'singleton',
      apiKey: null,
      predictionsEnabled: true,
      mirrorIntensity: 'medium',
    });
  }
}

// State helpers
export async function getState(): Promise<WhiteRoomState> {
  await initializeDB();
  return (await db.state.get('singleton'))!;
}

export async function updateState(
  updates: Partial<Omit<WhiteRoomState, 'id'>>
): Promise<void> {
  await db.state.update('singleton', {
    ...updates,
    updatedAt: Date.now(),
  });
}

// Calculate days since first interaction
export function getDaysSinceStart(state: WhiteRoomState): number {
  if (state.firstInteractionAt === 0) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - state.firstInteractionAt) / msPerDay);
}

// Interaction helpers
export async function addInteraction(
  interaction: Omit<Interaction, 'id'>
): Promise<number> {
  const id = await db.interactions.add(interaction);

  // Update state
  const state = await getState();
  const updates: Partial<WhiteRoomState> = {
    totalInteractions: state.totalInteractions + 1,
  };

  // Set first interaction timestamp if this is the first
  if (state.firstInteractionAt === 0) {
    updates.firstInteractionAt = interaction.timestamp;
  }

  await updateState(updates);
  return id as number;
}

export async function getRecentInteractions(
  limit: number = 6
): Promise<Interaction[]> {
  return db.interactions.orderBy('timestamp').reverse().limit(limit).toArray();
}

export async function getAllInteractions(): Promise<Interaction[]> {
  return db.interactions.orderBy('timestamp').toArray();
}

// Inference helpers
export async function getActiveInferences(): Promise<Inference[]> {
  return db.inferences.where('status').anyOf(['active', 'confirmed']).toArray();
}

export async function addInference(
  inference: Omit<Inference, 'id'>
): Promise<number> {
  return (await db.inferences.add(inference)) as number;
}

export async function updateInference(
  id: number,
  status: 'confirmed' | 'discarded'
): Promise<void> {
  await db.inferences.update(id, { status });
}

// Settings helpers
export async function getSettings(): Promise<WhiteRoomSettings> {
  await initializeDB();
  return (await db.settings.get('singleton'))!;
}

export async function updateSettings(
  updates: Partial<Omit<WhiteRoomSettings, 'id'>>
): Promise<void> {
  await db.settings.update('singleton', updates);
}

// Clear all data (for reset)
export async function clearAllData(): Promise<void> {
  await db.state.clear();
  await db.interactions.clear();
  await db.inferences.clear();
  await db.settings.clear();
  await initializeDB();
}

// Export data for backup
export async function exportData(): Promise<{
  state: WhiteRoomState;
  interactions: Interaction[];
  inferences: Inference[];
  settings: WhiteRoomSettings;
}> {
  return {
    state: await getState(),
    interactions: await db.interactions.toArray(),
    inferences: await db.inferences.toArray(),
    settings: await getSettings(),
  };
}
