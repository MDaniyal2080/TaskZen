import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
  private readonly CSRF_HEADER = 'x-csrf-token';
  private readonly CSRF_COOKIE = 'csrf-token';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Skip CSRF check for safe methods
    if (this.SAFE_METHODS.includes(request.method)) {
      return true;
    }

    // Skip for API endpoints that use JWT authentication
    // JWT tokens in Authorization headers provide CSRF protection
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return true;
    }

    // For session-based auth, check CSRF token
    const csrfHeader = request.headers[this.CSRF_HEADER];
    const csrfCookie = request.cookies?.[this.CSRF_COOKIE];

    if (!csrfHeader || !csrfCookie) {
      throw new BadRequestException('CSRF token missing');
    }

    if (csrfHeader !== csrfCookie) {
      throw new BadRequestException('Invalid CSRF token');
    }

    return true;
  }

  /**
   * Generate a CSRF token for the client
   */
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

/**
 * Since we're using JWT tokens in Authorization headers,
 * we have inherent CSRF protection. This guard is optional
 * for additional security in cookie-based sessions.
 */
