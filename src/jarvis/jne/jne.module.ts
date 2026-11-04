import { Module, Global } from '@nestjs/common';
import { JneObserverService } from './jne-observer.service';

@Global()
@Module({
  providers: [JneObserverService],
  exports: [JneObserverService],
})
export class JneModule {}

