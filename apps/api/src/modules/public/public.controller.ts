import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../infra/auth/auth.decorators';
import { PublicService } from './public.service';

// Public book preview. JSON (default for the SPA / `?format=json` / Accept JSON)
// or OG HTML (crawlers / `?format=html`). Mirrors the legacy ogBook function;
// served at /book/** via a hosting rewrite to Cloud Run during cutover.
@ApiTags('public')
@Controller({ path: 'public/books', version: '1' })
export class PublicController {
  constructor(private readonly pub: PublicService) {}

  @Public()
  @Get(':id')
  async getBook(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Headers('accept') accept: string | undefined,
    @Res() res: Response,
  ) {
    const wantsJson =
      format === 'json' || (!!accept && accept.includes('application/json'));

    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');

    let book: Record<string, unknown> | null = null;
    try {
      book = await this.pub.loadBook(id);
    } catch {
      book = null;
    }

    if (!this.pub.isPublic(book)) {
      if (wantsJson) res.status(404).json({ error: 'unavailable' });
      else res.status(404).type('html').send(this.pub.unavailableHtml());
      return;
    }

    const preview = this.pub.toPreview(id, book as Record<string, unknown>);
    if (wantsJson) res.status(200).json(preview);
    else res.status(200).type('html').send(this.pub.previewHtml(preview));
  }
}
