import { Module, Global } from '@nestjs/common';
import { DialogueEngineService } from './dialogue-engine.service';
import { ResponseNoveltyGuardService } from './response-novelty-guard.service';
import { ConversationalContinuityService } from './conversational-continuity.service';
import { TaskContractValidatorService } from './task-contract-validator.service';

@Global()
@Module({
  providers: [
    DialogueEngineService,
    ResponseNoveltyGuardService,
    ConversationalContinuityService,
    TaskContractValidatorService,
  ],
  exports: [
    DialogueEngineService,
    ResponseNoveltyGuardService,
    ConversationalContinuityService,
    TaskContractValidatorService,
  ],
})
export class DialogueModule {}
