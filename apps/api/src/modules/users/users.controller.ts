import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { CreateProfileDto } from './dto/create-profile.dto';
import { FcmTokenDto, LibraryDto } from './dto/user.dto';
import { UsersService } from './users.service';

// NOTE: static segments (`me`, `check-username`, `by-username`) are declared
// BEFORE the `:uid` catch-all so they are not swallowed by it.
@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  // Signup profile creation. The Auth account already exists (client created
  // it); this stamps the profile + username claim and enforces COPPA.
  @Post()
  createProfile(@CurrentUser() user: AuthUser, @Body() dto: CreateProfileDto) {
    return this.users.createProfile(user, dto);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.uid);
  }

  @Post('me/welcome-email')
  sendWelcomeEmail(@CurrentUser() user: AuthUser) {
    return this.users.sendWelcomeEmail(user);
  }

  // App Store 5.1.1(v): in-app account deletion. The client signs out after.
  @Delete('me')
  deleteMe(@CurrentUser() user: AuthUser) {
    return this.users.deleteAccount(user.uid);
  }

  // Pre-signup username availability — unauthenticated.
  @Public()
  @Get('check-username')
  async checkUsername(@Query('username') username: string) {
    return { available: await this.users.usernameAvailable(username) };
  }

  @Get('me/purchases')
  getPurchases(@CurrentUser() user: AuthUser) {
    return this.users.getPurchases(user.uid);
  }

  @Patch('me')
  @HttpCode(204)
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    await this.users.updateMe(user.uid, body, user.username);
  }

  // Daily points claim (server-authoritative cooldown + 25/day cap).
  @Post('me/claim-daily')
  claimDaily(@CurrentUser() user: AuthUser) {
    return this.users.claimDailyPoints(user.uid);
  }

  // Spend 150 points for a coupon-wheel spin (the coupon stays client-managed).
  @Post('me/spin')
  spin(@CurrentUser() user: AuthUser) {
    return this.users.spinWheel(user.uid);
  }

  @Post('me/fcm-tokens')
  @HttpCode(204)
  async addFcmToken(@CurrentUser() user: AuthUser, @Body() dto: FcmTokenDto) {
    await this.users.addFcmToken(user.uid, dto.token);
  }

  @Delete('me/fcm-tokens/:token')
  @HttpCode(204)
  async removeFcmToken(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
  ) {
    await this.users.removeFcmToken(user.uid, token);
  }

  @Post('me/library')
  @HttpCode(204)
  async addToLibrary(@CurrentUser() user: AuthUser, @Body() dto: LibraryDto) {
    await this.users.addToLibrary(user.uid, dto.bookId);
  }

  @Delete('me/library/:bookId')
  @HttpCode(204)
  async removeFromLibrary(
    @CurrentUser() user: AuthUser,
    @Param('bookId') bookId: string,
  ) {
    await this.users.removeFromLibrary(user.uid, bookId);
  }

  @Get('by-username/:username')
  async getByUsername(@Param('username') username: string) {
    const user = await this.users.getByUsername(username);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @Get(':uid')
  getById(@Param('uid') uid: string) {
    return this.users.getById(uid);
  }
}
