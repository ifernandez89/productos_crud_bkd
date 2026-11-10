import { Global, Module } from '@nestjs/common';
import { ActionGatekeeperService } from './action-gatekeeper.service';
import { AuditService } from './audit.service';
import { SecurityKernelAuthGuard } from './security-kernel-auth.guard';

/**
 * SecurityKernelModule — Módulo global acotado exclusivamente al Security Kernel (DEV-001-B1).
 *
 * Permite que AuthController, GoogleAuthController, MobileGatewayController y AppModule
 * compartan un único singleton de ActionGatekeeperService, AuditService y SecurityKernelAuthGuard
 * sin necesidad de marcar todo JarvisModule como @Global().
 */
@Global()
@Module({
  providers: [AuditService, ActionGatekeeperService, SecurityKernelAuthGuard],
  exports: [AuditService, ActionGatekeeperService, SecurityKernelAuthGuard],
})
export class SecurityKernelModule {}

