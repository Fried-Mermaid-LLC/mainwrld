// World emotes (P2 — emoji-only). A small fixed set the player can broadcast in
// the 3D world; each is sent through RTDB as { type, id } and rendered as an
// emoji burst over the avatar (no skeletal animation — the GLB models ship only a
// walk/idle clip). `type` is the wire value; skeletal-animation emotes can later
// branch on it (e.g. type:'wave' → play a 'wave' clip) without changing the wire.

export type EmoteType = 'wave' | 'love' | 'laugh' | 'fire' | 'like';

export interface EmoteDef {
  type: EmoteType;
  emoji: string;
  label: string;
}

export const EMOTES: EmoteDef[] = [
  { type: 'wave', emoji: '👋', label: 'Wave' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'laugh', emoji: '😂', label: 'Laugh' },
  { type: 'fire', emoji: '🔥', label: 'Fire' },
  { type: 'like', emoji: '👍', label: 'Like' },
];

// type → emoji, for rendering a received emote whose type we recognise.
export const EMOTE_EMOJI: Record<string, string> = Object.fromEntries(
  EMOTES.map(e => [e.type, e.emoji])
);

// Fallback emoji for an unknown/forward-compatible type.
export const DEFAULT_EMOTE_EMOJI = '✨';

export const emojiForEmote = (type: string): string =>
  EMOTE_EMOJI[type] ?? DEFAULT_EMOTE_EMOJI;
