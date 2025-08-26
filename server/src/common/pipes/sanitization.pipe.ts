import { PipeTransform, Injectable, ArgumentMetadata } from "@nestjs/common";
import * as DOMPurify from "isomorphic-dompurify";

@Injectable()
export class SanitizationPipe implements PipeTransform<unknown, unknown> {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // Only sanitize body/query payloads. Skip params like @UploadedFile(s) which are marked as 'custom'.
    if (
      metadata?.type &&
      metadata.type !== "body" &&
      metadata.type !== "query"
    ) {
      return value;
    }

    // Preserve binary types
    if (this.isBinary(value)) return value;

    // Only sanitize string values
    if (typeof value === "string") {
      return this.sanitizeString(value);
    }

    // Recursively sanitize object properties
    if (typeof value === "object" && value !== null) {
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
      .replace(/[';]/g, "") // Remove potential SQL injection characters
      .trim();
  }

  private sanitizeObject(input: unknown): unknown {
    // Preserve binary objects
    if (this.isBinary(input)) return input;

    if (Array.isArray(input)) {
      return input.map((item) =>
        this.transform(item, { type: "custom" } as ArgumentMetadata),
      );
    }

    if (typeof input === "object" && input !== null) {
      const obj = input as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        sanitized[key] = this.transform(obj[key], {
          type: "custom",
        } as ArgumentMetadata);
      }
      return sanitized;
    }

    return input;
  }

  private isBinary(value: unknown): boolean {
    // Node Buffer check must be guarded in browser/server shared code
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return true;
    return (
      value instanceof Uint8Array ||
      value instanceof ArrayBuffer ||
      value instanceof DataView
    );
  }
}
