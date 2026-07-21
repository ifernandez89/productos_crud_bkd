import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CognitiveFieldService } from '../memory/cognitive-field.service';
import { HypothesisEngineService } from './hypothesis-engine.service';
import { InterferenceEngineService } from './interference-engine.service';
import { UncertaintyEngineService } from './uncertainty-engine.service';
import { CognitiveOrchestratorService } from './cognitive-orchestrator.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CognitiveFieldService,
    HypothesisEngineService,
    InterferenceEngineService,
    UncertaintyEngineService,
    CognitiveOrchestratorService,
  ],
  exports: [
    CognitiveFieldService,
    HypothesisEngineService,
    InterferenceEngineService,
    UncertaintyEngineService,
    CognitiveOrchestratorService,
  ],
})
export class CognitiveModule {}
