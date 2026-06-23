import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { Relationship } from '@mainwrld/types';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

export type RelationshipDoc = Relationship & { id: string };

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
    // Idempotent: don't duplicate an existing edge.
    const existing = await this.col
      .where('admirer', '==', admirer)
      .where('target', '==', target)
      .limit(1)
      .get();
    if (!existing.empty) return;
    await this.col.add({
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
