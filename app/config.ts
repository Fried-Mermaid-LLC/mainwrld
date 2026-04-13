export const BASE = import.meta.env.BASE_URL;

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_51SxGPW2Urthc1FwfeRDmVhtNVchR7iiZATzRQJcyRjzNLA3ME99cQXQbbgP0ngtnVxAQCckZYcFKAi2vld0w4YR900P0pvdCEO';
declare const Stripe: any;
export const getStripe = () => {
  if (typeof Stripe !== 'undefined') {
    return Stripe(STRIPE_PUBLISHABLE_KEY);
  }
  return null;
};

export const STRIPE_PRICE_IDS: Record<string, string> = {
  'points_100': 'price_1SxGd02Urthc1FwfJ02cf6Sk',
  'points_300': 'price_1SxGdI2Urthc1Fwfk1qYWoUs',
  'points_500': 'price_1SxGdb2Urthc1Fwf7Bi8D5Pd',
  'points_1000': 'price_1SxGdq2Urthc1FwfPCXOdLMJ',
};

export const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  'points_100': 'https://buy.stripe.com/test_eVq14g1gU4qR2oQ6REdwc03',
  'points_300': 'https://buy.stripe.com/test_9B6aEQe3G8H7gfGb7Udwc02',
  'points_500': 'https://buy.stripe.com/test_28E9AMcZC9Lb1kM8ZMdwc00',
  'points_1000': 'https://buy.stripe.com/test_3cI9AMcZC9Lb1kM8ZMdwc00',
};

export const STRIPE_PREMIUM_PAYMENT_LINK = 'https://buy.stripe.com/test_premium';
export const STRIPE_PREMIUM_PRICE_ID = '';
export const STRIPE_BOOK_PRICE_ID = '';

export const EMAILJS_SERVICE_ID = 'service_kbm17fr';
export const EMAILJS_TEMPLATE_ID = 'template_nb60w6i';
export const EMAILJS_PUBLIC_KEY = 'drZ-kExBHYqajT2vm';

declare const emailjs: any;

export const sendWelcomeEmail = async (email: string, displayName: string, username: string) => {
  try {
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      console.log('[MainWRLD] Welcome email skipped — EmailJS not configured.');
      console.log(`[MainWRLD] Would send welcome email to: ${email} for user ${displayName} (@${username})`);
      return;
    }
    if (typeof emailjs === 'undefined') {
      console.log('[MainWRLD] EmailJS SDK not loaded.');
      return;
    }
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: email,
      to_name: displayName,
      username,
      app_name: 'MainWRLD',
    }, EMAILJS_PUBLIC_KEY);
    console.log('[MainWRLD] Welcome email sent to', email);
  } catch (err) {
    console.error('[MainWRLD] Failed to send welcome email:', err);
  }
};

export default {
  BASE,
  STRIPE_PUBLISHABLE_KEY,
  getStripe,
  STRIPE_PRICE_IDS,
  STRIPE_PAYMENT_LINKS,
  STRIPE_PREMIUM_PAYMENT_LINK,
  STRIPE_PREMIUM_PRICE_ID,
  STRIPE_BOOK_PRICE_ID,
  EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
  sendWelcomeEmail,
};