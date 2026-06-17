import { getFunctions, httpsCallable } from "firebase/functions";

export const BASE = import.meta.env.BASE_URL;

// Stripe Payment Link URLs differ between test and live modes. Vite sets
// `import.meta.env.PROD` to true only in production builds (`vite build`),
// false in `vite dev` — so local dev hits test mode automatically, and the
// CI build deployed to mainwrld.com hits live. The slug after `test_` is
// the same in both envs because Stripe assigns it deterministically per
// account, but treat each URL as opaque.
const isProd = import.meta.env.PROD;

export const STRIPE_PAYMENT_LINKS: Record<string, string> = isProd
  ? {
      points_100: "https://buy.stripe.com/4gM6oHdkrdiW52b35l6oo00",
      points_300: "https://buy.stripe.com/00w28r6W3a6K3Y735l6oo01",
      points_500: "https://buy.stripe.com/6oU4gz94b2Ei8en0Xd6oo02",
      points_1000: "https://buy.stripe.com/8x2dR93JR5Qu52b7lB6oo03",
    }
  : {
      points_100: "https://buy.stripe.com/test_4gM6oHdkrdiW52b35l6oo00",
      points_300: "https://buy.stripe.com/test_00w28r6W3a6K3Y735l6oo01",
      points_500: "https://buy.stripe.com/test_6oU4gz94b2Ei8en0Xd6oo02",
      points_1000: "https://buy.stripe.com/test_8x2dR93JR5Qu52b7lB6oo03",
    };

export const STRIPE_PREMIUM_PAYMENT_LINK = isProd
  ? "https://buy.stripe.com/eVqeVdcgn92G3Y70Xd6oo04"
  : "https://buy.stripe.com/test_eVqeVdcgn92G3Y70Xd6oo04";

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

export default {
  BASE,
  STRIPE_PAYMENT_LINKS,
  STRIPE_PREMIUM_PAYMENT_LINK,
  RESEND_FROM_EMAIL,
  RESEND_SUBJECT,
  sendWelcomeEmail,
};
