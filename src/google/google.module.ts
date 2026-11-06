import { Module, forwardRef } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthController } from './google-auth.controller';
import { JarvisModule } from '../jarvis/jarvis.module';

@Module({
  imports: [forwardRef(() => JarvisModule)],
  providers: [GoogleAuthService],
  controllers: [GoogleAuthController],
  exports: [GoogleAuthService],
})
export class GoogleModule {}
