import { Module } from '@nestjs/common';
import { SpotlightController } from './spotlight.controller';
import { SpotlightService } from './spotlight.service';

@Module({
  controllers: [SpotlightController],
  providers: [SpotlightService],
  exports: [SpotlightService],
})
export class SpotlightModule {}
