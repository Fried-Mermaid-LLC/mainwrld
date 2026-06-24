import { Module } from '@nestjs/common';
import { AdminBooksController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AdminBooksController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
