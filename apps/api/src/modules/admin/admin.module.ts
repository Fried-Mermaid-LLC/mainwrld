import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminBooksController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminController, AdminBooksController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
