import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  DocumentReference,
  Firestore,
} from 'firebase-admin/firestore';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { ModerationService } from '../moderation/moderation.service';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';

export type CommentDoc = Record<string, unknown> & {
  docId: string;
  id: string;
};

@Injectable()
export class CommentsService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly moderation: ModerationService,
  ) {}

  private get col() {
    return this.db.collection(COLLECTIONS.comments);
  }

  async list(bookId?: string): Promise<CommentDoc[]> {
    const query = bookId ? this.col.where('bookId', '==', bookId) : this.col;
    const snap = await query.get();
    return snap.docs.map((d) => {
      const data = d.data();
      return { docId: d.id, ...data, id: (data.id as string) || d.id } as CommentDoc;
    });
  }

  // Comments are addressed by docId, but legacy docs carry an `id` field that
  // differs — resolve both (mirrors the client's updateComment/removeCommentDoc).
  private async resolveRef(
    commentId: string,
  ): Promise<DocumentReference | null> {
    const direct = this.col.doc(commentId);
    if ((await direct.get()).exists) return direct;
    const q = await this.col.where('id', '==', commentId).limit(1).get();
    return q.empty ? null : q.docs[0].ref;
  }

  async create(user: AuthUser, dto: CreateCommentDto): Promise<{ id: string }> {
    const verdict = await this.moderation.screen(dto.text);
    if (verdict.flagged) {
      await this.moderation.logFlag(
        'Comment',
        'rejected-on-write',
        user.username,
        verdict.topCategory ?? 'unknown',
        verdict.score,
      );
      throw new UnprocessableEntityException({
        code: 'moderation-flagged',
        message: 'Content violates community guidelines',
      });
    }
    const ref = this.col.doc();
    const comment = {
      id: ref.id,
      bookId: dto.bookId,
      chapterIndex: dto.chapterIndex ?? null,
      author: dto.author,
      authorUsername: user.username ?? null,
      text: dto.text,
      likes: 0,
      likedBy: [] as string[],
      timestamp: new Date().toISOString(),
    };
    await ref.set(comment);
    return { id: ref.id };
  }

  async update(
    commentId: string,
    user: AuthUser,
    dto: UpdateCommentDto,
  ): Promise<void> {
    const ref = await this.resolveRef(commentId);
    if (!ref) throw new NotFoundException('Comment not found');
    const data = (await ref.get()).data() as Record<string, unknown>;

    // Editing the text requires authorship + re-moderation. likes/likedBy are
    // collaborative (any authed user toggles a like).
    if (dto.text !== undefined) {
      if (data.authorUsername !== user.username && !user.admin) {
        throw new ForbiddenException('Not the comment author');
      }
      const verdict = await this.moderation.screen(dto.text);
      if (verdict.flagged) {
        throw new UnprocessableEntityException({
          code: 'moderation-flagged',
          message: 'Content violates community guidelines',
        });
      }
    }

    const patch: Record<string, unknown> = {};
    if (dto.text !== undefined) patch.text = dto.text;
    if (dto.likes !== undefined) patch.likes = dto.likes;
    if (dto.likedBy !== undefined) patch.likedBy = dto.likedBy;
    if (Object.keys(patch).length) await ref.update(patch);
  }

  async remove(commentId: string, user: AuthUser): Promise<void> {
    const ref = await this.resolveRef(commentId);
    if (!ref) return;
    const data = (await ref.get()).data() as Record<string, unknown>;
    if (data.authorUsername !== user.username && !user.admin) {
      throw new ForbiddenException('Not the comment author');
    }
    await ref.delete();
  }
}
