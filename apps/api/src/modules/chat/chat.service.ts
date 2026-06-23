import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Firestore } from 'firebase-admin/firestore';
import type { ChatMessage } from '@mainwrld/types';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { ModerationService } from '../moderation/moderation.service';

const MAX_MESSAGE_LENGTH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_CONVERSATION_PER_DAY = 25;

@Injectable()
export class ChatService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly moderation: ModerationService,
  ) {}

  private get col() {
    return this.db.collection(COLLECTIONS.chatMessages);
  }

  // Server-side merge of sent + received (replaces the client's two-listener
  // merge). Messages are keyed by username.
  async listForUser(username: string): Promise<ChatMessage[]> {
    const [sent, received] = await Promise.all([
      this.col.where('from', '==', username).get(),
      this.col.where('to', '==', username).get(),
    ]);
    const byId = new Map<string, ChatMessage>();
    for (const d of sent.docs) {
      const m = d.data() as ChatMessage;
      byId.set(m.id, m);
    }
    for (const d of received.docs) {
      const m = d.data() as ChatMessage;
      byId.set(m.id, m);
    }
    return Array.from(byId.values());
  }

  async send(
    from: string,
    fromUid: string,
    to: string,
    text: string,
  ): Promise<ChatMessage> {
    // Pre-moderation (replaces moderateChatMessageOnCreate).
    const verdict = await this.moderation.screen(text);
    if (verdict.flagged) {
      await this.moderation.logFlag(
        'Chat',
        'rejected-on-write',
        from,
        verdict.topCategory ?? 'unknown',
        verdict.score,
      );
      throw new UnprocessableEntityException({
        code: 'moderation-flagged',
        message: 'Content violates community guidelines',
      });
    }

    // Rate-limit pre-check (replaces enforceChatRateLimit backstop): max 25
    // outgoing messages from->to per rolling 24h.
    const cutoffIso = new Date(Date.now() - DAY_MS).toISOString();
    const recent = await this.col
      .where('from', '==', from)
      .where('to', '==', to)
      .where('timestamp', '>=', cutoffIso)
      .get();
    if (recent.size >= MAX_MESSAGES_PER_CONVERSATION_PER_DAY) {
      throw new HttpException(
        {
          code: 'resource-exhausted',
          message: 'Daily message limit reached for this conversation.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // senderIsPremium is a point-in-time snapshot, read server-side (drives
    // membership-aware retention) — never trust the client.
    const senderSnap = await this.db
      .collection(COLLECTIONS.users)
      .doc(fromUid)
      .get();
    const senderIsPremium = senderSnap.data()?.isPremium === true;

    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2, 11),
      from,
      to,
      text: text.slice(0, MAX_MESSAGE_LENGTH),
      timestamp: new Date().toISOString(),
      read: false,
      senderIsPremium,
    };
    await this.col.add(msg);
    return msg;
  }

  // Mark messages from `peer` to me as read.
  async markRead(peer: string, me: string): Promise<void> {
    const snap = await this.col
      .where('from', '==', peer)
      .where('to', '==', me)
      .get();
    const batch = this.db.batch();
    let n = 0;
    for (const d of snap.docs) {
      if (!d.data().read) {
        batch.update(d.ref, { read: true });
        n++;
      }
    }
    if (n) await batch.commit();
  }
}
