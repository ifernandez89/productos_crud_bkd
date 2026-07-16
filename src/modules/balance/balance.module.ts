import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { JarvisModule } from '../../jarvis/jarvis.module';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { BalanceQuestionnaireService } from './balance-questionnaire.service';
import { BalanceAnalysisService } from './balance-analysis.service';
import { BalanceRecommendationService } from './balance-recommendation.service';

@Module({
  imports: [PrismaModule, JarvisModule],
  controllers: [BalanceController],
  providers: [
    BalanceService,
    BalanceQuestionnaireService,
    BalanceAnalysisService,
    BalanceRecommendationService,
  ],
  exports: [BalanceService],
})
export class BalanceModule {}
