import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";

interface JwtWsPayload {
  sub: string;
  email: string;
  role: string;
  isActive: boolean;
  iat?: number;
  exp?: number;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      // Prefer token from handshake.auth (browser-friendly), then query param, then Authorization header
      const headerToken = client.handshake.headers.authorization?.split(" ")[1];
      const query = client.handshake.query as Record<
        string,
        string | string[] | undefined
      >;
      const queryTokenValue = query?.token;
      const queryToken = Array.isArray(queryTokenValue)
        ? queryTokenValue[0]
        : queryTokenValue;
      // Safely read token from handshake.auth without using 'any'
      const authData: unknown = client.handshake?.auth;
      let handshakeToken: string | undefined;
      if (
        authData &&
        typeof authData === "object" &&
        authData !== null &&
        "token" in authData
      ) {
        const val = (authData as Record<string, unknown>).token;
        if (typeof val === "string") {
          handshakeToken = val;
        }
      }
      const authToken = handshakeToken || queryToken || headerToken;

      if (!authToken) {
        try {
          const origin = client.handshake.headers.origin || "unknown";
          const nsp = client.nsp?.name || "unknown";
          this.logger.warn(
            `WS guard: missing token id=${client.id} nsp=${nsp} origin=${origin}`,
          );
        } catch {}
        throw new WsException("Unauthorized");
      }
      const payload = this.jwtService.verify<JwtWsPayload>(authToken);
      client.data.user = payload;
      try {
        const origin = client.handshake.headers.origin || "unknown";
        const nsp = client.nsp?.name || "unknown";
        this.logger.log(
          `WS guard: authorized id=${client.id} nsp=${nsp} origin=${origin} user=${payload?.sub || "unknown"}`,
        );
      } catch {}

      return true;
    } catch (err) {
      try {
        const client: Socket = context.switchToWs().getClient<Socket>();
        const origin = client?.handshake?.headers?.origin || "unknown";
        const nsp = client?.nsp?.name || "unknown";
        this.logger.warn(
          `WS guard: token verify failed id=${client?.id} nsp=${nsp} origin=${origin}`,
        );
      } catch {}
      throw new WsException("Unauthorized");
    }
  }
}
