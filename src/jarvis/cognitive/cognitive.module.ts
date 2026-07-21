import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CognitiveFieldService } from '../memory/cognitive-field.service';
import { HypothesisEngineService } from './hypothesis-engine.service';
import { InterferenceEngineService } from './interference-engine.service';
import { UncertaintyEngineService } from './uncertainty-engine.service';
import { EpigeneticRegulatorService } from './epigenetic-regulator.service';
import { PredictiveProcessingService } from './predictive-processing.service';
import { MetacognitionEngineService } from './metacognition-engine.service';
import { CognitiveOrchestratorService } from './cognitive-orchestrator.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CognitiveFieldService,
    HypothesisEngineService,
    InterferenceEngineService,
    UncertaintyEngineService,
    EpigeneticRegulatorService,
    PredictiveProcessingService,
    MetacognitionEngineService,
    CognitiveOrchestratorService,
  ],
  exports: [
    CognitiveFieldService,
    HypothesisEngineService,
    InterferenceEngineService,
    UncertaintyEngineService,
    EpigeneticRegulatorService,
    PredictiveProcessingService,
    MetacognitionEngineService,
    CognitiveOrchestratorService,
  ],
})
export class CognitiveModule {}
