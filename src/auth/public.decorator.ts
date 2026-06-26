import { SetMetadata } from '@nestjs/common';
import { PUBLIC_KEY } from './jwt.guard';

/**
 * Marca un endpoint como público (sin autenticación).
 *
 * Uso:
 *   @Public()
 *   @Get('health')
 *   healthCheck() { return { ok: true }; }
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
