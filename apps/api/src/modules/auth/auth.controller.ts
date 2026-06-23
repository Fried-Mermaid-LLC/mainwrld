import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { AuthService } from './auth.service';
import { PasswordResetDto } from './dto/password-reset.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiBearerAuth()
  @Post('ensure-claim')
  ensureClaim(@CurrentUser() user: AuthUser) {
    return this.auth.ensureUsernameClaim(user.uid);
  }

  // Login helper — unauthenticated (the user can't sign in yet).
  @Public()
  @Get('resolve-username/:username')
  resolveUsername(@Param('username') username: string) {
    return this.auth.resolveUsername(username);
  }

  @Public()
  @Post('password-reset')
  passwordReset(@Body() dto: PasswordResetDto) {
    return this.auth.sendPasswordReset(dto.email.trim().toLowerCase());
  }
}
