import { getFunctions, httpsCallable } from "firebase/functions";

export const BASE = import.meta.env.BASE_URL;

// Stripe runs on LIVE everywhere — local dev, TestFlight, and the mainwrld.com
// web build all hit real Stripe and move real money. There is no test/live
// toggle anymore; treat each Payment Link URL as opaque.
export const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  points_100: "https://buy.stripe.com/4gM6oHdkrdiW52b35l6oo00",
  points_300: "https://buy.stripe.com/00w28r6W3a6K3Y735l6oo01",
  points_500: "https://buy.stripe.com/6oU4gz94b2Ei8en0Xd6oo02",
  points_1000: "https://buy.stripe.com/8x2dR93JR5Qu52b7lB6oo03",
};

export const STRIPE_PREMIUM_PAYMENT_LINK =
  "https://buy.stripe.com/eVqeVdcgn92G3Y70Xd6oo04";

// Coupon shop. A purchased coupon is the same Coupon {id,value,used} the
// spin wheel grants: `value` is the USD-face discount and `value * 100` is
// the points knocked off at checkout (see CartView). `sku` is the shared
// identifier across iOS IAP (mainwrld.<sku>), the Stripe Payment Link's
// metadata[sku], and both server-side grant maps (stripeWebhook /
// verifyAppleReceipt). Prices mirror the points packs above.
export const COUPON_PRODUCTS = [
  { sku: "coupon_100", usd: 0.99, pointsOff: 100, value: 1 },
  { sku: "coupon_300", usd: 2.99, pointsOff: 300, value: 3 },
  { sku: "coupon_500", usd: 4.99, pointsOff: 500, value: 5 },
  { sku: "coupon_1000", usd: 9.99, pointsOff: 1000, value: 10 },
] as const;

// Stripe Payment Links for coupon purchases (web only — iOS uses IAP).
// Create one Stripe product + Payment Link per sku with metadata[sku] set
// (e.g. metadata[sku]=coupon_100), exactly like the points packs, and paste
// the URLs here. Until a link is filled in, the web "Buy" button surfaces a
// "not yet available" toast instead of redirecting to an empty URL.
export const STRIPE_COUPON_PAYMENT_LINKS: Record<string, string> = {
  coupon_100: "",
  coupon_300: "",
  coupon_500: "",
  coupon_1000: "",
};

export const RESEND_FROM_EMAIL = "noreply@mainwrld.com";
export const RESEND_SUBJECT = "Welcome to MainWRLD!";

// Sends the post-signup welcome email via the `sendWelcomeEmail` callable
// Cloud Function (Resend lives server-side). Best-effort: failures are logged,
// never thrown, so a mail hiccup never blocks sign-up. The recipient is taken
// from the caller's auth token server-side; `email` is sent only as a fallback.
export const sendWelcomeEmail = async (
  email: string,
  displayName: string,
  username: string,
) => {
  try {
    const fn = httpsCallable<
      { email: string; displayName: string; username: string },
      { success: boolean }
    >(getFunctions(), "sendWelcomeEmail");
    await fn({ email, displayName, username });
    console.log("[MainWRLD] Welcome email sent");
  } catch (err) {
    console.error("[MainWRLD] Welcome email failed:", err);
  }
};

// Sends the branded "forgot password" email via the `sendPasswordReset`
// callable Cloud Function (Resend + an Admin-SDK reset link, server-side).
// The server always resolves with success — even for unknown addresses — so it
// never leaks which emails have accounts; only a transport failure rejects.
export const sendPasswordReset = async (email: string) => {
  const fn = httpsCallable<{ email: string }, { success: boolean }>(
    getFunctions(),
    "sendPasswordReset",
  );
  await fn({ email });
};

export default {
  BASE,
  STRIPE_PAYMENT_LINKS,
  STRIPE_PREMIUM_PAYMENT_LINK,
  COUPON_PRODUCTS,
  STRIPE_COUPON_PAYMENT_LINKS,
  RESEND_FROM_EMAIL,
  RESEND_SUBJECT,
  sendWelcomeEmail,
  sendPasswordReset,
};
