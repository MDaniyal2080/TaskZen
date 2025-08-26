import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { v4 as uuidv4 } from "uuid";
import type {
  AnalyticsEventType as AnalyticsEventTypeStr,
  FeatureKey as FeatureKeyStr,
} from "./types";
import {
  AnalyticsEventType as PrismaAnalyticsEventType,
  FeatureKey as PrismaFeatureKey,
  Prisma,
} from "@prisma/client";
import type { IncomingHttpHeaders } from "http";

interface RequestLike {
  headers?: IncomingHttpHeaders;
}

@Injectable()
export class AnalyticsEventsService {
  constructor(private readonly prisma: PrismaService) {}

  private getClientInfo(req?: RequestLike) {
    const uaH = req?.headers?.["user-agent"];
    const devH = req?.headers?.["x-device"];
    const osH = req?.headers?.["x-os"];
    const countryH =
      req?.headers?.["x-country"] ?? req?.headers?.["cf-ipcountry"];
    const ua = Array.isArray(uaH) ? uaH[0] : uaH;
    const device = Array.isArray(devH) ? devH[0] : devH;
    const os = Array.isArray(osH) ? osH[0] : osH;
    const country = Array.isArray(countryH) ? countryH[0] : countryH;
    return { browser: ua, device, os, country };
  }

  async startSession(
    userId: string,
    dto: {
      sessionId?: string;
      device?: string;
      browser?: string;
      os?: string;
      country?: string;
      page?: string;
      referrer?: string;
      metadata?: Record<string, unknown>;
    },
    req?: RequestLike,
  ) {
    const sessionId = dto.sessionId || uuidv4();
    const client = this.getClientInfo(req);

    const created = await this.prisma.userSession.create({
      data: {
        sessionId,
        userId,
        device: dto.device ?? client.device,
        browser: dto.browser ?? client.browser,
        os: dto.os ?? client.os,
        country: dto.country ?? client.country,
      },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        type: PrismaAnalyticsEventType.SESSION_START,
        sessionId,
        userId,
        page: dto.page,
        referrer: dto.referrer,
        device: dto.device ?? client.device,
        browser: dto.browser ?? client.browser,
        os: dto.os ?? client.os,
        country: dto.country ?? client.country,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });

    return { sessionId: created.sessionId, startedAt: created.startedAt };
  }

  async endSession(
    userId: string,
    dto: { sessionId: string; metadata?: Record<string, unknown> },
  ) {
    const session = await this.prisma.userSession.findUnique({
      where: { sessionId: dto.sessionId },
    });

    if (!session) {
      // Create an end event even if we can't find session row
      await this.prisma.analyticsEvent.create({
        data: {
          type: PrismaAnalyticsEventType.SESSION_END,
          sessionId: dto.sessionId,
          userId,
          metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
        },
      });
      return { sessionId: dto.sessionId, ended: true, durationSec: null };
    }

    const now = new Date();
    const durationSec = Math.max(
      0,
      Math.floor((now.getTime() - session.startedAt.getTime()) / 1000),
    );

    const updated = await this.prisma.userSession.update({
      where: { sessionId: dto.sessionId },
      data: { endedAt: now, durationSec },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        type: PrismaAnalyticsEventType.SESSION_END,
        sessionId: dto.sessionId,
        userId,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });

    return {
      sessionId: updated.sessionId,
      endedAt: updated.endedAt,
      durationSec: updated.durationSec,
    };
  }

  async recordEvent(
    userId: string,
    dto: {
      type: AnalyticsEventTypeStr;
      feature?: FeatureKeyStr;
      page?: string;
      referrer?: string;
      sessionId?: string;
      device?: string;
      browser?: string;
      os?: string;
      country?: string;
      boardId?: string;
      cardId?: string;
      metadata?: Record<string, unknown>;
    },
    req?: RequestLike,
  ) {
    // Validate optional foreign keys to avoid FK violations
    let boardId: string | undefined = dto.boardId;
    let cardId: string | undefined = dto.cardId;

    const checks: Promise<void>[] = [];
    if (dto.boardId) {
      checks.push(
        this.prisma.board
          .findUnique({ where: { id: dto.boardId } })
          .then((b) => {
            if (!b) boardId = undefined;
          }),
      );
    }
    if (dto.cardId) {
      checks.push(
        this.prisma.card.findUnique({ where: { id: dto.cardId } }).then((c) => {
          if (!c) cardId = undefined;
        }),
      );
    }
    if (checks.length) await Promise.all(checks);

    const client = this.getClientInfo(req);

    const event = await this.prisma.analyticsEvent.create({
      data: {
        type: dto.type as PrismaAnalyticsEventType,
        feature: (dto.feature as PrismaFeatureKey) ?? undefined,
        page: dto.page,
        referrer: dto.referrer,
        sessionId: dto.sessionId,
        device: dto.device ?? client.device,
        browser: dto.browser ?? client.browser,
        os: dto.os ?? client.os,
        country: dto.country ?? client.country,
        userId,
        boardId,
        cardId,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });

    return { id: event.id, createdAt: event.createdAt };
  }
}
