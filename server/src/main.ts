import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { WinstonModule } from 'nest-winston';
import { loggerConfig } from './config/logger.config';
import { helmetConfig, corsConfig, validationConfig } from './config/security.config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { SanitizationPipe } from './common/pipes/sanitization.pipe';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { PrismaService } from './database/prisma.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  // Create logger instance
  const logger = WinstonModule.createLogger(loggerConfig);
  
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });
  
  const configService = app.get(ConfigService);
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);
  
  // Security middleware
  app.use(cookieParser());
  app.use(helmetConfig);
  app.use(compression());
  // Hide framework details
  app.disable('x-powered-by');
  
  // Enable CORS with enhanced config
  const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const envOrigins = [
    configService.get<string>('FRONTEND_URL'),
    configService.get<string>('CLIENT_URL'),
  ].filter((o): o is string => Boolean(o));
  const mergedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));
  app.enableCors({
    ...corsConfig,
    origin: ((origin, callback) => {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        // Allow all origins in development to simplify LAN testing
        return callback(null, true);
      }
      // In production, enforce allowlist
      if (!origin || mergedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    }) as any,
  });

  // Global pipes and filters
  app.useGlobalPipes(new SanitizationPipe(), new ValidationPipe(validationConfig));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Serve static files for uploads
  const uploadPath = configService.get('UPLOAD_PATH', 'uploads');
  app.useStaticAssets(join(process.cwd(), uploadPath), {
    prefix: '/uploads/',
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger (OpenAPI) setup
  const config = new DocumentBuilder()
    .setTitle('TaskZen API')
    .setDescription('TaskZen backend API documentation')
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      in: 'header',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
    customSiteTitle: 'TaskZen API Docs',
  });

  const port = configService.get('PORT', 3001);
  const host = '0.0.0.0';

  // Process-level diagnostics
  process.on('unhandledRejection', (reason: any, promise) => {
    Logger.error(
      `UnhandledPromiseRejection: ${reason?.message || reason}`,
      reason?.stack,
      'Process',
    );
  });
  process.on('uncaughtException', (err: any) => {
    Logger.error(
      `UncaughtException: ${err?.message || err}`,
      err?.stack,
      'Process',
    );
  });
  process.on('SIGINT', () => {
    Logger.warn('Received SIGINT. Shutting down gracefully...', 'Process');
  });
  process.on('SIGTERM', () => {
    Logger.warn('Received SIGTERM. Shutting down gracefully...', 'Process');
  });

  await app.listen(port, host);
  
  Logger.log(`🚀 TaskZen API is running on: http://localhost:${port} (bound to ${host})`, 'Bootstrap');
  Logger.log(`🛡️ Global prefix: /api/v1`, 'Bootstrap');
  Logger.log(`🔒 Security features enabled: Helmet, CORS, Rate Limiting`, 'Bootstrap');
  Logger.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`, 'Bootstrap');
}

bootstrap();
