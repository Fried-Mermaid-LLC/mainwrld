import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { Report } from '@mainwrld/types';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import type { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get col() {
    return this.db.collection(COLLECTIONS.reports);
  }

  async list(): Promise<Report[]> {
    const snap = await this.col.get();
    return snap.docs.map((d) => ({ ...d.data() }) as Report);
  }

  async create(reportedBy: string, dto: CreateReportDto): Promise<{ id: string }> {
    const ref = this.col.doc();
    const id = dto.id || ref.id;
    await ref.set({
      id,
      type: dto.type,
      targetId: dto.targetId,
      reportedBy,
      timestamp: new Date().toISOString(),
      status: 'pending',
      // Only persist `reason` when supplied so legacy/auto-mod reports stay clean.
      ...(dto.reason ? { reason: dto.reason } : {}),
    });
    return { id };
  }

  async updateStatus(reportId: string, status: string): Promise<void> {
    // Reports are addressed by the `id` field (auto-moderation + client both
    // set it); fall back to docId.
    const direct = this.col.doc(reportId);
    if ((await direct.get()).exists) {
      await direct.update({ status });
      return;
    }
    const q = await this.col.where('id', '==', reportId).limit(1).get();
    if (!q.empty) await q.docs[0].ref.update({ status });
  }
}
