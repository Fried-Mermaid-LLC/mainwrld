import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { FavoriteDto, UploadCoverDto } from './dto/cover.dto';

@ApiTags('books')
@ApiBearerAuth()
@Controller({ path: 'books', version: '1' })
export class BooksController {
  constructor(private readonly books: BooksService) {}

  // Published books + the caller's own (incl. drafts), merged by id.
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.books.listForUser(user.uid);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.books.getForUser(id, user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookDto) {
    return this.books.create(user, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBookDto,
  ) {
    return this.books.update(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.books.remove(id, user);
  }

  // Upload a cover into book-covers/{uid}/{bookId}/… and return its URL + path.
  @Post(':id/cover')
  async cover(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadCoverDto,
  ) {
    const result = await this.books.uploadCover(user.uid, id, dto.dataUrl);
    if (dto.oldPath) await this.books.deleteCover(dto.oldPath);
    return result;
  }

  @Post(':id/favorite')
  @HttpCode(204)
  async favorite(@Param('id') id: string, @Body() dto: FavoriteDto) {
    await this.books.adjustFavorite(id, dto.delta);
  }
}
