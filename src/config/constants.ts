export const ACCENT_COLOR = '#eb6871';
export const WORLD_RADIUS = 50;
export const MAX_LIBRARY_SIZE = 35;
export const MIN_WORD_COUNT = 150;
export const MAX_DAILY_EARNED_POINTS = 25;
export const COMMENT_LIKES_THRESHOLD = 50;
export const CHAPTER_LIKES_THRESHOLD = 10;
export const MAX_DAILY_CHAPTERS = 7;
export const MAX_WORD_COUNT = 11000;
export const GENRE_LIST = ['Mystery', 'Sci-Fi', 'Romance', 'Horror', 'Dystopian', 'Fantasy', 'Action', 'Drama', 'Western', 'Fiction', 'Non-Fiction', 'Thriller', 'FanFic', 'Poetry', 'Religious', 'Erotica', 'LGBTQ+', 'Self-Help', 'Sports'];
export const ADMIN_USERNAMES = ['admin', 'mochamattel', 'jevonmahoney'];

// ---- Monetization pricing (F01) ----
// A book may only be priced in tiers its PUBLISHED chapter count unlocks:
//   5–7 ch → $9.99 only; 8–11 → +$14.99; 12–19 → +$19.99;
//   20–24 → +$24.99; 25+ → all five up to $29.99.
// allowedPriceTiers is the single source of truth, re-validated server-side
// in submitMonetizationRequest / reviewMonetization (those duplicate the
// table because functions/ cannot import from src/).
export const PRICE_TIERS = [9.99, 14.99, 19.99, 24.99, 29.99] as const;
export function allowedPriceTiers(chaptersCount: number): number[] {
  if (chaptersCount >= 25) return PRICE_TIERS.slice(0, 5);
  if (chaptersCount >= 20) return PRICE_TIERS.slice(0, 4);
  if (chaptersCount >= 12) return PRICE_TIERS.slice(0, 3);
  if (chaptersCount >= 8) return PRICE_TIERS.slice(0, 2);
  if (chaptersCount >= 5) return PRICE_TIERS.slice(0, 1);
  return [];
}

// Platform fee on the cash (Stripe) rail. The seller's connected account
// receives (1 - PLATFORM_FEE_RATE); MainWRLD keeps PLATFORM_FEE_RATE as the
// Stripe application_fee. Mirrored in functions/src/stripeConnect.ts.
export const PLATFORM_FEE_RATE = 0.2;

// How many real points 1 USD of book price converts to on the in-app
// points purchase rail (mirrors CartView's historic POINTS_PER_DOLLAR).
export const POINTS_PER_DOLLAR = 100;

// Terminal block: a book that was ever successfully monetized (then
// un-monetized / unpublished / taken down) can never be monetized again.
// `permanentlyDemonetized` is stamped server-side by the onBookMonetized
// trigger; `wasMonetizedBefore` is the legacy flag set by the demonetize
// handlers. A DENIED request does NOT set either (denial ≠ permanence).
export function canMonetize(book: {
  permanentlyDemonetized?: boolean;
  wasMonetizedBefore?: boolean;
}): boolean {
  return !book.permanentlyDemonetized && !book.wasMonetizedBefore;
}

// Lowest-likes-per-published-chapter, derived from the real per-chapter
// `likes` array on the book doc (NOT the never-set mock `minLikesPerChapter`
// field). An empty/short array treats missing chapters as 0 likes → blocked.
export function minLikesPerPublishedChapter(book: {
  likes?: number[] | number;
  chaptersCount?: number;
}): number {
  const count = book.chaptersCount || 0;
  if (count <= 0) return 0;
  const arr = Array.isArray(book.likes)
    ? book.likes
    : [typeof book.likes === 'number' ? book.likes : 0];
  const published: number[] = [];
  for (let i = 0; i < count; i++) published.push(arr[i] || 0);
  return published.length ? Math.min(...published) : 0;
}

export const BAD_WORDS = ['fuck','dick','cock','bastard','slut','cunt','nigger','nigga','n1gger','nigg3r','fag','faggot','retard','rape','penis','vagina','anal','porn','hentai','cum','jizz','sex','xxx','tits','kys','kms','stfu'];
export const containsBadWord = (text: string): boolean => {
  const lower = text.toLowerCase().replace(/[^a-z]/g, '');
  return BAD_WORDS.some(word => lower.includes(word));
};

export const SKIN_TONE_COLORS: Record<string, string> = {
  A1: '#FDDCC4', A2: '#F2C4A0', A3: '#D9A87C', A4: '#C68E5B', A5: '#A0714A', A5_5: '#9B6B45', A6: '#7A5539', A7: '#4A3228',
  B1: '#FDDCC4', B2: '#F2C4A0', B3: '#D9A87C', B4: '#C68E5B', B5: '#A0714A', B5_5: '#9B6B45', B6: '#7A5539', B7: '#4A3228',
};

export default {
  ACCENT_COLOR,
  WORLD_RADIUS,
  MAX_LIBRARY_SIZE,
  MIN_WORD_COUNT,
  MAX_DAILY_EARNED_POINTS,
  COMMENT_LIKES_THRESHOLD,
  CHAPTER_LIKES_THRESHOLD,
  MAX_DAILY_CHAPTERS,
  MAX_WORD_COUNT,
  GENRE_LIST,
  ADMIN_USERNAMES,
  PRICE_TIERS,
  allowedPriceTiers,
  PLATFORM_FEE_RATE,
  POINTS_PER_DOLLAR,
  canMonetize,
  minLikesPerPublishedChapter,
  BAD_WORDS,
  containsBadWord,
  SKIN_TONE_COLORS,
};