import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SingleInstanceLockService } from './single-instance-lock.service';
import {
  JARBEES_JWT_ALGORITHM,
  JARBEES_JWT_AUDIENCE,
  JARBEES_JWT_ISSUER,
  resolveRequiredJwtSecret,
} from './jwt-secret.util';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = resolveRequiredJwtSecret(cfg);
        const expiresIn = cfg.get<string>('JWT_EXPIRES_IN') ?? '12h';
        return {
          secret,
          signOptions: {
            algorithm: JARBEES_JWT_ALGORITHM,
            issuer: JARBEES_JWT_ISSUER,
            audience: JARBEES_JWT_AUDIENCE,
            expiresIn: expiresIn as any,
          },
          verifyOptions: {
            algorithms: [JARBEES_JWT_ALGORITHM],
            issuer: JARBEES_JWT_ISSUER,
            audience: JARBEES_JWT_AUDIENCE,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SingleInstanceLockService],
  exports: [JwtModule, AuthService, SingleInstanceLockService],
})
export class AuthModule {}
