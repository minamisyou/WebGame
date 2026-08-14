import type { Mode } from './core/types';
import type { Lang } from './i18n';

/** Mirrors the orb palette order so the shared bar matches what was played. */
const EMOJI = ['🟦', '🟩', '🟨', '🟥', '🟪', '🟧', '🟦', '🟩', '🟥', '🟦'];

export interface ShareData {
  mode: Mode;
  date: string;
  score: number;
  maxChain: number;
  maxOrb: number;
  lang: Lang;
}

/** One emoji per orb tier reached — a spoiler-free picture of the run. */
function ladder(maxOrb: number): string {
  let out = '';
  for (let v = 1; v <= Math.min(maxOrb, 14); v++) out += EMOJI[(v - 1) % EMOJI.length];
  return out;
}

export function buildShareText(data: ShareData): string {
  const label = data.mode === 'daily' ? `DAILY ${data.date}` : data.mode.toUpperCase();
  const score = data.score.toLocaleString(data.lang === 'ko' ? 'ko-KR' : 'en-US');
  const line =
    data.lang === 'ko'
      ? `${score}점 · 최대연쇄 x${data.maxChain} · 최고오브 ${data.maxOrb}`
      : `${score} pts · chain x${data.maxChain} · top orb ${data.maxOrb}`;
  return [`GRAVITON ${label}`, line, ladder(data.maxOrb), location.href].join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** Native share sheet when available, clipboard otherwise. */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      // A user-cancelled share sheet is not a failure worth falling back on.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
