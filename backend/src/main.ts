import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow up to 5MB JSON body (data-URL frame uploads ~ ~4MB for 3MB images)
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ limit: '5mb', extended: true }));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL || '*' });

  const doc = new DocumentBuilder()
    .setTitle('VCA API')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(process.env.PORT || 3001);
}
bootstrap();
