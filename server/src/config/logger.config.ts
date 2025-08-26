import { WinstonModuleOptions } from "nest-winston";
import * as winston from "winston";
import * as path from "path";

const logDir = path.join(process.cwd(), "logs");

export const loggerConfig: WinstonModuleOptions = {
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, context, trace }) => {
            return `${timestamp} [${context}] ${level}: ${message}${trace ? `\n${trace}` : ""}`;
          },
        ),
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // Log level based on environment
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
};
