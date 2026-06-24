/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../infra/auth/auth-user.interface';
import { FakeFirestore } from './fake-firestore';

export { FakeFirestore };

export function makeAuthUser(over: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: 'u1',
    email: 'u1@test.com',
    username: 'alice',
    admin: false,
    banned: false,
    ...over,
  };
}

// Minimal ConfigService whose get(key, {infer}) returns the nested config slice.
// `over.secrets` is merged onto the default secrets (not replaced wholesale).
export function fakeConfig(over: Record<string, any> = {}): ConfigService {
  const { secrets: secretsOver, ...rest } = over;
  const cfg: Record<string, any> = {
    nodeEnv: 'test',
    port: 8080,
    corsOrigins: [],
    siteUrl: 'http://localhost',
    internalCronSecret: 'cron-secret',
    firebase: {},
    ...rest,
    secrets: {
      resendApiKey: '',
      stripeSecretKey: 'sk_test_x',
      stripeTestSecretKey: 'sk_test_x',
      stripeLiveWebhookSecret: 'whsec_live',
      stripeTestWebhookSecret: 'whsec_test',
      openaiApiKey: '',
      apple: {
        issuerId: 'iss',
        keyId: 'kid',
        bundleId: 'com.mainwrld',
        privateKey: 'pk',
        env: 'Sandbox',
      },
      ...secretsOver,
    },
  };
  return {
    get: (key: string) => cfg[key],
  } as unknown as ConfigService;
}

// In-memory firebase-admin Auth double. customClaims persist; jest.fn() spies
// expose call assertions.
export function createFakeAuth(
  users: Record<string, { customClaims?: Record<string, any>; email?: string }> = {},
) {
  const store: Record<string, any> = { ...users };
  return {
    _store: store,
    getUser: jest.fn(async (uid: string) => store[uid] ?? { customClaims: {} }),
    setCustomUserClaims: jest.fn(async (uid: string, claims: Record<string, any>) => {
      store[uid] = { ...(store[uid] ?? {}), customClaims: claims };
    }),
    updateUser: jest.fn(async (uid: string, props: Record<string, any>) => {
      store[uid] = { ...(store[uid] ?? {}), ...props };
    }),
    revokeRefreshTokens: jest.fn(async () => {}),
    deleteUser: jest.fn(async (uid: string) => {
      delete store[uid];
    }),
    generatePasswordResetLink: jest.fn(async () => 'https://reset.link/oob'),
    verifyIdToken: jest.fn(),
  };
}

export function createFakeMessaging() {
  return {
    sendEachForMulticast: jest.fn(async () => ({
      successCount: 1,
      responses: [{ success: true }],
    })),
  };
}

export function createFakeStorage() {
  const saved: Array<{ path: string; buffer: Buffer }> = [];
  const file = (path: string) => ({
    save: jest.fn(async (buffer: Buffer) => {
      saved.push({ path, buffer });
    }),
    delete: jest.fn(async () => {}),
  });
  return {
    _saved: saved,
    bucket: jest.fn(() => ({ name: 'test-bucket', file })),
  };
}

export function createFakeEmail() {
  return {
    send: jest.fn(
      async (_to: string, _subject: string, _html: string) => ({
        ok: true,
        status: 200,
      }),
    ),
    userContact: jest.fn(async (uid?: string | null) => ({
      email: uid ? `${uid}@test.com` : null,
      displayName: 'Tester',
      username: 'tester',
    })),
  };
}

export function createFakeModeration(flagged = false) {
  return {
    screen: jest.fn(async () => ({
      flagged,
      topCategory: flagged ? 'profanity' : undefined,
    })),
    logFlag: jest.fn(async () => {}),
  };
}

// Server-authoritative points service (RewardsService). All methods are no-op
// fakes — the points logic itself is covered by rewards.service.spec.
export function createFakeRewards() {
  return {
    awardEarnedPoints: jest.fn(async () => 0),
    onChapterLikeChanged: jest.fn(async () => {}),
    onCommentLikesChanged: jest.fn(async () => {}),
    claimDaily: jest.fn(async () => ({
      claimed: true,
      awarded: 0,
      nextAvailableAt: null,
    })),
    spendForSpin: jest.fn(async () => ({ ok: true, points: 0 })),
    applyMembershipReward: jest.fn(async () => {}),
  };
}
