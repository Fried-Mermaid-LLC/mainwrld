import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

@Module({
  imports: [NotificationsModule],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
