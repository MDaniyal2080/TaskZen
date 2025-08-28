import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

type AuthenticatedRequest = Request & { user?: { id?: string } };

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const authReq = request as AuthenticatedRequest;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error = "Internal Server Error";
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const r = exceptionResponse as Record<string, unknown>;
        const msgField = r["message"];
        const errField = r["error"];
        message = typeof msgField === "string" ? msgField : exception.message;
        error = typeof errField === "string" ? errField : "Error";
        details = r["details"];
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;

      // Log full error details for debugging
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
        {
          url: request.url,
          method: request.method,
          ip: request.ip,
          user: authReq.user?.id,
        },
      );
    }

    // Don't expose internal error details in production
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        message = "An unexpected error occurred";
        details = undefined;
      } else if (status === HttpStatus.NOT_FOUND) {
        // Provide a friendly 404 message
        message = "The requested resource was not found.";
        // Do not include backend details for normal users
        details = undefined;
      }
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error,
      message,
      ...(details && { details }),
      ...(process.env.NODE_ENV !== "production" && {
        stack: exception instanceof Error ? exception.stack : undefined,
      }),
    };

    // Log error
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      {
        ...errorResponse,
        ip: request.ip,
        userAgent: request.get("user-agent"),
        user: authReq.user?.id,
      },
    );

    response.status(status).json(errorResponse);
  }
}
