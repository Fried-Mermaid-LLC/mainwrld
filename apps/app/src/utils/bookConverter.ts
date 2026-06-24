import type { Book } from '@/types'

// Rebuild a client-shaped `Book` from a raw Firestore book doc, mirroring the
// realtime converter in useBooks.ts (which rebuilds `author` from the
// denormalized authorUsername/authorDisplayName fields and normalizes `likes`).
// Used outside that subscription — e.g. fetching a single shared book on demand
// (F09) for a deep-linked / post-auth `book-detail` open.
export function convertFirestoreBook(
  fb: any,
  favoriteBookIds?: Set<string>
): Book {
  return {
    ...fb,
    author: {
      username: fb.authorUsername || fb.author?.username || 'unknown',
      displayName: fb.authorDisplayName || fb.author?.displayName || 'Unknown',
      isOnline: false,
      activity: 'Idle' as const,
      position: [0, 0, 0] as [number, number, number],
      isMutual: false,
      points: 0,
      admirersCount: 0,
      mutualsCount: 0,
      strikes: 0
    },
    likes: Array.isArray(fb.likes) ? fb.likes : [fb.likes || 0],
    isFavorite: favoriteBookIds?.has(fb.id) ?? false,
    price: fb.price ?? 0,
    // Backward-compat: legacy docs store `isExplicit`, new docs `isMature`.
    // Normalize so the rest of the app only reads `isMature`.
    isMature: fb.isMature ?? fb.isExplicit ?? false
  } as Book
}
