import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common'; // restart
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // Asegurar que las carpetas de subida existan (en una instalación nueva
  // no están, y Multer fallaría al guardar imágenes/plantillas).
  const uploadsRoot = join(process.cwd(), 'uploads');
  for (const sub of ['images', 'templates', 'generated', 'tmp']) {
    mkdirSync(join(uploadsRoot, sub), { recursive: true });
  }

  // Servir archivos estáticos (imágenes de fondo, PDFs generados)
  app.useStaticAssets(uploadsRoot, { prefix: '/uploads/' });

  // Aumentar el límite de payload para JSON grandes (ej. Bulk Import)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // Helmet — Security headers (XSS, clickjacking, MIME sniffing, etc.)
  // Se deshabilita contentSecurityPolicy para no romper Swagger UI en desarrollo
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  }));

  // CORS
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global Pipes & Filters
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('PPP System API')
    .setDescription('Plataforma SaaS para gestión de Prácticas Preprofesionales')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Start Server
  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
}
bootstrap();
