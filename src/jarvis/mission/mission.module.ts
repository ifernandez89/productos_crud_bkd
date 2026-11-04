import { Module } from '@nestjs/common';
import { MissionEngineService } from './mission-engine.service';

@Module({
  providers: [MissionEngineService],
  exports: [MissionEngineService],
})
export class MissionModule {}
