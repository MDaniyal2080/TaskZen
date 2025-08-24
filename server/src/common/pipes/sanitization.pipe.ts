import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import * as DOMPurify from 'isomorphic-dompurify';

@Injectable()
export class SanitizationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    // Only sanitize body/query payloads. Skip params like @UploadedFile(s) which are marked as 'custom'.
    if (metadata?.type && metadata.type !== 'body' && metadata.type !== 'query') {
      return value;
    }

    // Preserve binary types
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array || value instanceof ArrayBuffer || value instanceof DataView) return value;

    // Only sanitize string values
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    
    // Recursively sanitize object properties
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value);
    }
    
    // Return other types as-is
    return value;
  }

  private sanitizeString(str: string): string {
    // Remove HTML tags and scripts
    const cleaned = DOMPurify.sanitize(str, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
    
    // Additional sanitization for SQL injection prevention
    // (Though parameterized queries in Prisma already handle this)
    return cleaned
      .replace(/[';]/g, '') // Remove potential SQL injection characters
      .trim();
  }

  private sanitizeObject(obj: any): any {
    // Preserve binary objects
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) return obj;
    if (obj instanceof Uint8Array || obj instanceof ArrayBuffer || obj instanceof DataView) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.transform(item, {} as ArgumentMetadata));
    }
    
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = this.transform(obj[key], {} as ArgumentMetadata);
      }
    }
    return sanitized;
  }
}
