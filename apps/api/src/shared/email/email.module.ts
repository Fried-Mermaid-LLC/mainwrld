import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

// Global so payments / iap / membership / users / auth / scheduler / monetization
// can inject EmailService without re-importing.
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
