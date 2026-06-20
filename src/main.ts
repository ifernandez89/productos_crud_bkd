import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,   // acumula logs hasta que winston esté listo
  });

  // Reemplaza el logger interno de Nest por Winston
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuración de CORS para permitir GitHub Pages y desarrollo local
  app.enableCors({
    origin: [
      'http://localhost:3000',           // Next.js dev local
      'http://localhost:4000',           // Backend local
      'https://ifernandez89.github.io',  // GitHub Pages producción
      /https:\/\/.*\.ngrok\.io$/,        // Cualquier URL de ngrok
      /https:\/\/.*\.ngrok-free\.app$/,  // Nuevo dominio de ngrok
      /https:\/\/.*\.loca\.lt$/,         // Localtunnel
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  const config = new DocumentBuilder()
    .setTitle('Productos API')
    .setDescription('API de gestión de productos con IA')
    .setVersion('1.0')
    .addTag('products')
    .addTag('aichat')
    .addTag('upload')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
