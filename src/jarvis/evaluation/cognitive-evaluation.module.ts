import { Module } from '@nestjs/common';
import { CognitiveEvaluationService } from './cognitive-evaluation.service';

@Module({
  providers: [CognitiveEvaluationService],
  exports: [CognitiveEvaluationService],
})
export class CognitiveEvaluationModule {}
