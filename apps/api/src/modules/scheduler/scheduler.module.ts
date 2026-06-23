import { Module } from '@nestjs/common';
import { SpotlightModule } from '../spotlight/spotlight.module';
import { CronGuard } from './cron.guard';
import { SchedulerController } from './scheduler.controller';
import { SchedulerJobsService } from './scheduler-jobs.service';

@Module({
  imports: [SpotlightModule], // for SpotlightService.rotate()
  controllers: [SchedulerController],
  providers: [SchedulerJobsService, CronGuard],
})
export class SchedulerModule {}
