import { API_BASE } from '@/lib/apiClient';
import type { PublicBookPreview } from '@/types';

// Fetch the allow-listed public preview for a shared book (F09) from the API's
// public endpoint (no auth — the server reads with Admin privileges). Returns
// null for draft / missing / unshareable books (the endpoint answers 404).
export async function fetchPublicBookPreview(
  id: string
): Promise<PublicBookPreview | null> {
  try {
    const res = await fetch(
      `${API_BASE}/public/books/${encodeURIComponent(id)}?format=json`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicBookPreview;
  } catch {
    return null;
  }
}
