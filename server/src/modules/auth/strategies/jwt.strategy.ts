import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  isActive?: boolean;
  iat?: number;
  exp?: number;
}
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        "JWT_SECRET",
        "taskzen-secret-key",
      ),
    });
  }

  async validate(payload: JwtPayload) {
    // DB-free validation: trust JWT payload (expiry already enforced by Passport)
    if (payload?.isActive === false) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      isActive: payload?.isActive ?? true,
    };
  }
}
