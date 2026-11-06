import { Module } from '@nestjs/common';
import { BrokerAuditService } from './broker-audit.service';
import { ExecutionBrokerService } from './execution-broker.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';

@Module({
  providers: [
    PolicyEvaluatorService,
    BrokerAuditService,
    ExecutionBrokerService,
  ],
  exports: [
    PolicyEvaluatorService,
    BrokerAuditService,
    ExecutionBrokerService,
  ],
})
export class ExecutionBrokerModule {}

