import { Module } from '@nestjs/common';
import { DailyJobsService } from './daily-jobs.service';
import { JarvisModule } from '../jarvis/jarvis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [JarvisModule, PrismaModule],
  providers: [DailyJobsService],
})
export class JobsModule {}
