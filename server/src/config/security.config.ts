import helmet from 'helmet';
import { ValidationPipeOptions } from '@nestjs/common';

const isProd = process.env.NODE_ENV === 'production';

export const helmetConfig = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'https:', 'ws:', 'wss:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const corsConfig = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
};

export const validationConfig: ValidationPipeOptions = {
  whitelist: true, // Strip properties that don't have decorators
  forbidNonWhitelisted: true, // Throw error if non-whitelisted values are provided
  transform: true, // Automatically transform payloads to DTO instances
  disableErrorMessages: process.env.NODE_ENV === 'production',
  validationError: {
    target: false, // Don't expose the target object in error messages
    value: false, // Don't expose the value in error messages
  },
  transformOptions: {
    enableImplicitConversion: true, // Automatically convert primitive types
  },
};
