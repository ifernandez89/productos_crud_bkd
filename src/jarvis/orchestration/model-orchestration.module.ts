import { Module } from '@nestjs/common';
import { ModelSelectionEngineService } from './model-selection-engine.service';

@Module({
  providers: [ModelSelectionEngineService],
  exports: [ModelSelectionEngineService],
})
export class ModelOrchestrationModule {}

