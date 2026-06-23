import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../infra/auth/auth.decorators';
import { CronGuard } from './cron.guard';
import { SchedulerJobsService } from './scheduler-jobs.service';

// Internal cron endpoints, called by Cloud Scheduler. @Public() skips the
// Firebase AuthGuard; CronGuard enforces the shared secret instead.
@ApiTags('scheduler')
@Public()
@UseGuards(CronGuard)
@Controller({ path: 'internal/cron', version: '1' })
export class SchedulerController {
  constructor(private readonly jobs: SchedulerJobsService) {}

  @Post('rotate-spotlight')
  rotateSpotlight() {
    return this.jobs.rotateSpotlight();
  }

  @Post('prune-messages')
  pruneMessages() {
    return this.jobs.pruneExpiredMessages();
  }

  @Post('renewal-reminders')
  renewalReminders() {
    return this.jobs.sendRenewalReminders();
  }
}
