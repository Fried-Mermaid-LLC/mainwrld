import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RewardsService } from './rewards.service';

// Global so the books / comments / users endpoints can inject RewardsService for
// server-authoritative points (like milestones, daily claim, spin, membership).
@Global()
@Module({
  imports: [NotificationsModule],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
