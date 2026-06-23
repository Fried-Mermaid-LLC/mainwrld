import { auth } from '@/lib/firebase';

// Base URL of the NestJS API. Same requireEnv contract as firebase.ts so a
// missing value surfaces through bootGuard instead of a silent failure.
const BASE = import.meta.env.VITE_API_URL as string | undefined;
if (!BASE) {
  throw new Error(
    'Missing VITE_API_URL. Copy .env.example to .env.local and set the API base URL.'
  );
}

export const API_BASE = `${BASE.replace(/\/+$/, '')}/api/v1`;

// Mirrors the legacy callable/Firestore error codes the app branches on, so
// existing `err.code === 'permission-denied'` checks keep working. The server
// also returns `{ code, message }` which takes precedence.
function mapStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'invalid-argument';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'permission-denied';
    case 404:
      return 'not-found';
    case 409:
      return 'already-exists';
    case 412:
    case 422:
      return 'failed-precondition';
    case 429:
      return 'resource-exhausted';
    case 503:
      return 'unavailable';
    default:
      return 'internal';
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// The ONLY place the ID token is read. Firebase Auth caches + auto-refreshes it;
// `force` triggers a hard refresh for the 401 retry.
async function authHeader(force = false): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken(force);
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  _retry = false
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // One auto-retry on 401 with a force-refreshed token (ID tokens expire hourly).
  if (res.status === 401 && !_retry && auth.currentUser) {
    await authHeader(true);
    return request<T>(method, path, body, true);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw new ApiError(
      res.status,
      data.code ?? mapStatusToCode(res.status),
      data.message ?? res.statusText
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
