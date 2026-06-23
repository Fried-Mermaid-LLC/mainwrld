import { buildBookShareUrl } from '@/config/constants'
import type { PublicBookPreview } from '@/types'

// Fetch the allow-listed public preview for a shared book (F09) from the
// `ogBook` Cloud Function (Hosting `/book/**` rewrite). Works WITHOUT auth —
// the function runs with Admin privileges and bypasses Firestore rules, so a
// signed-out visitor on a shared `/book/<id>` link can render the preview card.
// Always uses the absolute SHARE_BASE so it works from the iOS WebView
// (capacitor://localhost) too, not just same-origin web. Returns null for
// draft / missing / unshareable books (the function answers 404).
export async function fetchPublicBookPreview(
  id: string
): Promise<PublicBookPreview | null> {
  try {
    const res = await fetch(`${buildBookShareUrl(id)}?format=json`, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return null
    return (await res.json()) as PublicBookPreview
  } catch {
    return null
  }
}
