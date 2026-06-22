import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// Server-side backstop for the per-conversation daily message cap (F08).
//
// The client enforces "25 outgoing messages per sender per conversation per
// rolling 24h" for UX (instant toast, keeps the input). Firestore rules cannot
// count sibling documents, so this trigger is the bypass-proof backstop: on
// every new chatMessages doc it counts the sender's messages to the same
// recipient in the trailing 24h and deletes the offending doc once the cap is
// exceeded. Mutual-only private DMs are a low abuse surface, so a post-write
// delete (mirroring moderateChatMessageOnCreate) is acceptable.
//
// `timestamp` is an ISO-8601 string, so a lexicographic >= range matches a
// chronological "since cutoff" window. Requires the composite index
// chatMessages(from ASC, to ASC, timestamp ASC) in firestore.indexes.json.

const MAX_MESSAGES_PER_CONVERSATION_PER_DAY = 25
const DAY_MS = 24 * 60 * 60 * 1000

export const enforceChatRateLimit = onDocumentCreated(
  {
    region: 'us-central1',
    document: 'chatMessages/{messageId}',
  },
  async (event) => {
    const snap = event.data
    if (!snap) return
    const data = snap.data()
    const from = data?.from as string | undefined
    const to = data?.to as string | undefined
    if (!from || !to) return

    const cutoffIso = new Date(Date.now() - DAY_MS).toISOString()
    const recent = await getFirestore()
      .collection('chatMessages')
      .where('from', '==', from)
      .where('to', '==', to)
      .where('timestamp', '>=', cutoffIso)
      .get()

    // `recent` includes the just-created doc. Allowing up to the cap means a
    // window size > cap identifies this doc as the one over the limit.
    if (recent.size <= MAX_MESSAGES_PER_CONVERSATION_PER_DAY) return

    await snap.ref.delete()
    logger.info('chat rate limit exceeded — message removed', {
      id: event.params.messageId,
      from,
      to,
      windowCount: recent.size,
    })
  }
)
