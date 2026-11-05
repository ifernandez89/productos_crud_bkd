import { Module, Global } from '@nestjs/common';
import { TaskEnvelopeService } from './task-envelope.service';

@Global()
@Module({
  providers: [TaskEnvelopeService],
  exports: [TaskEnvelopeService],
})
export class TaskEnvelopeModule {}

