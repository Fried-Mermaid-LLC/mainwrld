import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('comments')
@ApiBearerAuth()
@Controller({ path: 'comments', version: '1' })
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(@Query('bookId') bookId?: string) {
    return this.comments.list(bookId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommentDto) {
    return this.comments.create(user, dto);
  }

  @Patch(':id')
  @HttpCode(204)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCommentDto,
  ) {
    await this.comments.update(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.comments.remove(id, user);
  }
}
