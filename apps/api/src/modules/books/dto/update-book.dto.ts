import { PartialType } from '@nestjs/swagger';
import { OmitType } from '@nestjs/swagger';
import { CreateBookDto } from './create-book.dto';

// All author-writable fields, optional. `id` is dropped — the book id comes
// from the route param, not the body.
export class UpdateBookDto extends PartialType(
  OmitType(CreateBookDto, ['id'] as const),
) {}
