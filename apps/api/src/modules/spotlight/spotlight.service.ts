import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

export interface SpotlightDoc {
  spotlightBookId?: string;
  weekEpoch?: number;
  chosenIds?: string[];
  score?: number;
  source?: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The Star of the Week is selected server-side (rotateSpotlight cron / admin
// rotate). Clients only READ appConfig/spotlight.
@Injectable()
export class SpotlightService {
  private readonly logger = new Logger(SpotlightService.name);

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get ref() {
    return this.db.collection(COLLECTIONS.appConfig).doc('spotlight');
  }

  async get(): Promise<SpotlightDoc | null> {
    const snap = await this.ref.get();
    return snap.exists ? (snap.data() as SpotlightDoc) : null;
  }

  // Deterministic lifetime score: total chapter likes + favoritesTotal.
  private scoreBook(b: DocumentData): number {
    const likes = Array.isArray(b.likes)
      ? (b.likes as number[]).reduce((s, n) => s + (Number(n) || 0), 0)
      : Number(b.likes) || 0;
    const favs = Number(b.favoritesTotal) || 0;
    return likes + favs;
  }

  // Deterministic selection (no Math.random) with a chosenIds round-robin for
  // week-to-week variety. Ported from functions/src/spotlight.ts.
  async rotate(): Promise<{ ok: boolean; bookId?: string }> {
    const booksSnap = await this.db.collection(COLLECTIONS.books).get();
    const candidates = booksSnap.docs
      .map((d) => ({ id: (d.data().id as string) || d.id, data: d.data() }))
      .filter((c) => !!c.id && c.data.isDraft !== true)
      .map((c) => ({ ...c, score: this.scoreBook(c.data) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const da = new Date(a.data.publishedDate || 0).getTime();
        const dbb = new Date(b.data.publishedDate || 0).getTime();
        if (dbb !== da) return dbb - da;
        return a.id < b.id ? -1 : 1;
      });
    if (candidates.length === 0) return { ok: true };

    const cur = (await this.ref.get()).data() || {};
    const candidateIds = new Set(candidates.map((c) => c.id));
    let chosenIds: string[] = Array.isArray(cur.chosenIds)
      ? (cur.chosenIds as string[]).filter((id) => candidateIds.has(id))
      : [];
    let pick = candidates.find((c) => !chosenIds.includes(c.id));
    if (!pick) {
      chosenIds = [];
      pick = candidates[0];
    }

    await this.ref.set(
      {
        spotlightBookId: pick.id,
        weekEpoch: Math.floor(Date.now() / WEEK_MS),
        chosenIds: [...chosenIds, pick.id],
        score: pick.score,
        source: 'scheduled-fn',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    this.logger.log(`spotlight rotated -> ${pick.id} (score ${pick.score})`);
    return { ok: true, bookId: pick.id };
  }
}
