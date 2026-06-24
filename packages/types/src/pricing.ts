// Monetization pricing tiers + platform fee. Single source of truth shared by
// the client (UI gating) and the API (server-side re-validation). Mirrors the
// values previously duplicated across the app and the Cloud Functions.

export const PRICE_TIERS = [9.99, 14.99, 19.99, 24.99, 29.99] as const;

// MainWRLD takes a 30% application fee on book sales (70% to the seller via a
// Stripe destination charge).
export const PLATFORM_FEE_RATE = 0.3;

// Price tiers unlocked by the (server-truth) published chapter count.
export function allowedPriceTiers(chaptersCount: number): number[] {
  if (chaptersCount >= 25) return PRICE_TIERS.slice(0, 5);
  if (chaptersCount >= 20) return PRICE_TIERS.slice(0, 4);
  if (chaptersCount >= 12) return PRICE_TIERS.slice(0, 3);
  if (chaptersCount >= 8) return PRICE_TIERS.slice(0, 2);
  if (chaptersCount >= 5) return PRICE_TIERS.slice(0, 1);
  return [];
}
