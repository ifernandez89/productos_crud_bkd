import { Module } from '@nestjs/common';
import { ContextSelectorService } from './context-selector.service';

@Module({
  providers: [ContextSelectorService],
  exports: [ContextSelectorService],
})
export class ContextModule {}
