import { Module, Global } from '@nestjs/common';
import { DialogueEngineService } from './dialogue-engine.service';

@Global()
@Module({
  providers: [DialogueEngineService],
  exports: [DialogueEngineService],
})
export class DialogueModule {}

