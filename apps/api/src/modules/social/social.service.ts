import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { Relationship } from '@mainwrld/types';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

export type RelationshipDoc = Relationship & { id: string };

// Deterministic, collision-free document id for a directed edge. Usernames are
// validated to /^[a-zA-Z0-9_]+$/ (see RelationshipDto / CreateProfileDto), so
// ':' can never appear inside one and separates the pair injectively; the 'e_'
// prefix keeps the id from ever matching Firestore's reserved __.*__ pattern
// even when a username is all underscores. Writing the edge at this id makes
// add() idempotent by construction: two racing writes hit the SAME document and
// coalesce instead of each minting its own auto-id doc (the old TOCTOU race that
// seeded duplicate edges — which the world view then drew as one avatar twice).
const edgeId = (admirer: string, target: string): string =>
  `e_${admirer}:${target}`;

// Social graph (admirer -> target). The client reads the whole collection to
// build the graph; writes are keyed on the caller's username (server-stamped).
@Injectable()
export class SocialService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get col() {
    return this.db.collection(COLLECTIONS.relationships);
  }

  async list(): Promise<RelationshipDoc[]> {
    const snap = await this.col.get();
    return snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as RelationshipDoc,
    );
  }

  async add(admirer: string, target: string): Promise<void> {
    if (admirer === target) {
      throw new BadRequestException('Cannot admire yourself');
    }
    // Idempotent against any pre-existing edge — including legacy auto-id docs
    // written before the deterministic-id scheme (the field query catches those;
    // a bare doc(edgeId).get() would not, and would duplicate them).
    const existing = await this.col
      .where('admirer', '==', admirer)
      .where('target', '==', target)
      .limit(1)
      .get();
    if (!existing.empty) return;
    // Deterministic id (see edgeId): concurrent adds that both passed the check
    // above now write the same document and coalesce to a single edge, instead
    // of racing two auto-id docs into existence.
    await this.col.doc(edgeId(admirer, target)).set({
      admirer,
      target,
      timestamp: new Date().toISOString(),
    });
  }

  async remove(admirer: string, target: string): Promise<void> {
    const snap = await this.col
      .where('admirer', '==', admirer)
      .where('target', '==', target)
      .get();
    if (snap.empty) return;
    const batch = this.db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  async exists(admirer: string, target: string): Promise<boolean> {
    const snap = await this.col
      .where('admirer', '==', admirer)
      .where('target', '==', target)
      .limit(1)
      .get();
    return !snap.empty;
  }
}
