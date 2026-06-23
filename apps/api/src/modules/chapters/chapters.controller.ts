import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { ChaptersService } from './chapters.service';
import {
  CommitChapterDto,
  DeleteChapterDto,
} from './dto/commit-chapter.dto';

@ApiTags('chapters')
@ApiBearerAuth()
@Controller({ path: 'books/:bookId/chapters', version: '1' })
export class ChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  // Author/admin: ordered chapter list (incl. drafts).
  @Get()
  list(@Param('bookId') bookId: string, @CurrentUser() user: AuthUser) {
    return this.chapters.list(bookId, user);
  }

  // Reader gateway — paywall-enforced chapter body.
  @Get(':chapterId/content')
  getContent(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chapters.getContent(bookId, chapterId, user);
  }

  @Get(':chapterId')
  getOne(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chapters.getOne(bookId, chapterId, user);
  }

  @Put(':chapterId')
  @HttpCode(204)
  async commitWrite(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CommitChapterDto,
  ) {
    await this.chapters.commitWrite(bookId, chapterId, user, dto);
  }

  @Delete(':chapterId')
  @HttpCode(204)
  async commitDelete(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteChapterDto,
  ) {
    await this.chapters.commitDelete(bookId, chapterId, user, dto.bookUpdates);
  }
}
