import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { Public } from './public.decorator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  password: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con contraseña maestra — devuelve JWT' })
  @ApiBody({ schema: { properties: { password: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Login exitoso, devuelve access_token' })
  @ApiResponse({ status: 401, description: 'Contraseña incorrecta' })
  login(@Body() body: LoginDto) {
    return this.authService.login(body.password);
  }
}
