import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, OperatorLoginRequest } from './auth.service';
import { Public } from './public.decorator';
import { SecurityKernelAuthGuard } from '../jarvis/security/security-kernel-auth.guard';

@ApiTags('auth')
@UseGuards(SecurityKernelAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({
    default: { limit: 5, ttl: 60000 },
    strict: { limit: 5, ttl: 60000 },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login de operador — exige operatorId y password verificados con scrypt + bloqueo progresivo anti fuerza bruta (máx 5/min)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login exitoso, devuelve access_token firmado con HS256 y claims completos (sub, role, scopes, jti, iss, aud)',
  })
  login(@Body() body?: OperatorLoginRequest, @Req() req?: any) {
    return this.authService.login(body, {
      ip: req?.ip ?? req?.socket?.remoteAddress,
      forwardedFor: req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
    });
  }
}
