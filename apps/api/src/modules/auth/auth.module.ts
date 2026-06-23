import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Domain auth endpoints (claims / password reset / username resolution).
// The global AuthGuard + decorators live in infra/auth.
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthApiModule {}
