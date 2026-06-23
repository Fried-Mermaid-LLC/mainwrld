import { z } from 'zod';

// Flat env schema. Secrets are optional so the API boots in local dev before
// every domain's credentials are wired; the owning service validates presence
// at point of use. On Cloud Run these are injected from Secret Manager.
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  // Comma-separated allowlist; empty/absent => reflect request origin (dev).
  CORS_ORIGINS: z.string().optional(),
  SITE_URL: z.string().url().optional(),
  INTERNAL_CRON_SECRET: z.string().optional(),

  // ---- Firebase Admin ----
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_DATABASE_URL: z.string().url().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  // Path to a service-account JSON for LOCAL dev only. Unset on Cloud Run →
  // applicationDefault() picks up the runtime service account (ADC).
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  // ---- Secrets (optional until owning domain is implemented) ----
  RESEND_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_TEST_SECRET_KEY: z.string().optional(),
  STRIPE_LIVE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_TEST_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  APPLE_ISSUER_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_BUNDLE_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  APPLE_ENV: z.enum(['Sandbox', 'Production']).optional(),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfiguration {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  corsOrigins: string[];
  siteUrl?: string;
  internalCronSecret?: string;
  firebase: {
    projectId?: string;
    databaseURL?: string;
    storageBucket?: string;
    serviceAccountPath?: string;
  };
  secrets: {
    resendApiKey?: string;
    stripeSecretKey?: string;
    stripeTestSecretKey?: string;
    stripeLiveWebhookSecret?: string;
    stripeTestWebhookSecret?: string;
    openaiApiKey?: string;
    apple: {
      issuerId?: string;
      keyId?: string;
      bundleId?: string;
      privateKey?: string;
      env?: 'Sandbox' | 'Production';
    };
  };
}

// Loader for `ConfigModule.forRoot({ load: [configuration] })`. Validates
// process.env via zod and maps it into a typed nested structure so services
// read `config.get('firebase', { infer: true })` etc.
export function configuration(): AppConfiguration {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsOrigins:
      env.CORS_ORIGINS?.split(',')
        .map((o) => o.trim())
        .filter(Boolean) ?? [],
    siteUrl: env.SITE_URL,
    internalCronSecret: env.INTERNAL_CRON_SECRET,
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      databaseURL: env.FIREBASE_DATABASE_URL,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
      serviceAccountPath: env.FIREBASE_SERVICE_ACCOUNT_PATH,
    },
    secrets: {
      resendApiKey: env.RESEND_API_KEY,
      stripeSecretKey: env.STRIPE_SECRET_KEY,
      stripeTestSecretKey: env.STRIPE_TEST_SECRET_KEY,
      stripeLiveWebhookSecret: env.STRIPE_LIVE_WEBHOOK_SECRET,
      stripeTestWebhookSecret: env.STRIPE_TEST_WEBHOOK_SECRET,
      openaiApiKey: env.OPENAI_API_KEY,
      apple: {
        issuerId: env.APPLE_ISSUER_ID,
        keyId: env.APPLE_KEY_ID,
        bundleId: env.APPLE_BUNDLE_ID,
        privateKey: env.APPLE_PRIVATE_KEY,
        env: env.APPLE_ENV,
      },
    },
  };
}
