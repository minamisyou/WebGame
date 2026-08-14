import type { Mode, Snapshot } from './core/types';
import type { PaletteName } from './render/theme';

const PREFIX = 'graviton.v1.';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  palette: PaletteName;
  /** Which side the primary rotate button sits on, for one-handed play. */
  handedness: 'right' | 'left';
  lang: 'ko' | 'en';
}

export interface DailyResult {
  date: string;
  score: number;
  maxChain: number;
  maxOrb: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: true,
  reducedMotion: false,
  palette: 'default',
  handedness: 'right',
  lang: 'ko',
};

/**
 * localStorage can throw (Safari private mode, storage full, disabled
 * cookies). Persistence is a nicety here, never a requirement to play.
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore — the run continues without persistence */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  const stored = read<Partial<Settings>>('settings', {});
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  // First run: follow the OS motion preference and the browser language.
  if (stored.reducedMotion === undefined) {
    settings.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  if (stored.lang === undefined) {
    settings.lang = navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  write('settings', settings);
}

export function loadBest(mode: Mode): number {
  return read<number>(`best.${mode}`, 0);
}

export function saveBest(mode: Mode, score: number): boolean {
  if (score <= loadBest(mode)) return false;
  write(`best.${mode}`, score);
  return true;
}

/** The daily result is recorded once per date; replays are practice. */
export function loadDaily(date: string): DailyResult | null {
  const result = read<DailyResult | null>('daily', null);
  return result && result.date === date ? result : null;
}

export function saveDaily(result: DailyResult): void {
  write('daily', result);
}

export interface Hints {
  dropSeen: boolean;
  rotateSeen: boolean;
}

/** One-shot onboarding flags — each hint is shown once, ever. */
export function loadHints(): Hints {
  return read<Hints>('hints', { dropSeen: false, rotateSeen: false });
}

export function saveHints(hints: Hints): void {
  write('hints', hints);
}

export function loadSave(): Snapshot | null {
  const snapshot = read<Snapshot | null>('save', null);
  if (!snapshot || !Array.isArray(snapshot.grid) || snapshot.over) return null;
  return snapshot;
}

export function saveRun(snapshot: Snapshot): void {
  write('save', snapshot);
}

export function clearSave(): void {
  remove('save');
}
