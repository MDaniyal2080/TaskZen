import type { Request } from "express";
import type { UserRole } from "@prisma/client";

export interface RequestWithUser extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}
