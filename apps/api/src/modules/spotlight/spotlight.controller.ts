import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../../infra/auth/auth.decorators';
import { SpotlightService } from './spotlight.service';

@ApiTags('spotlight')
@Controller({ path: 'spotlight', version: '1' })
export class SpotlightController {
  constructor(private readonly spotlight: SpotlightService) {}

  // Public read — the Star of the Week is public info.
  @Public()
  @Get()
  get() {
    return this.spotlight.get();
  }

  // Admin bootstrap / manual rotation (rotateSpotlightNow).
  @ApiBearerAuth()
  @Roles('admin')
  @Post('rotate')
  rotate() {
    return this.spotlight.rotate();
  }
}
