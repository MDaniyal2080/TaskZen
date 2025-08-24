import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import type { AnalyticsEventType, FeatureKey } from './types';

interface RequestLike {
  headers?: Record<string, any>;
}

@Injectable()
export class AnalyticsEventsService {
  constructor(private readonly prisma: PrismaService) {}

  private getClientInfo(req?: RequestLike) {
    const ua = (req?.headers?.['user-agent'] as string) || undefined;
    const device = (req?.headers?.['x-device'] as string) || undefined;
    const os = (req?.headers?.['x-os'] as string) || undefined;
    const country =
      (req?.headers?.['x-country'] as string) ||
      (req?.headers?.['cf-ipcountry'] as string) ||
      undefined;
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
      metadata?: any;
    },
    req?: RequestLike,
  ) {
    const sessionId = dto.sessionId || uuidv4();
    const client = this.getClientInfo(req);

    const created = await (this.prisma as any).userSession.create({
      data: {
        sessionId,
        userId,
        device: dto.device ?? client.device,
        browser: dto.browser ?? client.browser,
        os: dto.os ?? client.os,
        country: dto.country ?? client.country,
      },
    });

    await (this.prisma as any).analyticsEvent.create({
      data: {
        type: 'SESSION_START' as any,
        sessionId,
        userId,
        page: dto.page,
        referrer: dto.referrer,
        device: dto.device ?? client.device,
        browser: dto.browser ?? client.browser,
        os: dto.os ?? client.os,
        country: dto.country ?? client.country,
        metadata: dto.metadata ?? undefined,
      },
    });

    return { sessionId: created.sessionId, startedAt: created.startedAt };
  }

  async endSession(
    userId: string,
    dto: { sessionId: string; metadata?: any },
  ) {
    const session = await (this.prisma as any).userSession.findUnique({
      where: { sessionId: dto.sessionId },
    });

    if (!session) {
      // Create an end event even if we can't find session row
      await (this.prisma as any).analyticsEvent.create({
        data: {
          type: 'SESSION_END' as any,
          sessionId: dto.sessionId,
          userId,
          metadata: dto.metadata ?? undefined,
        },
      });
      return { sessionId: dto.sessionId, ended: true, durationSec: null };
    }

    const now = new Date();
    const durationSec = Math.max(
      0,
      Math.floor((now.getTime() - session.startedAt.getTime()) / 1000),
    );

    const updated = await (this.prisma as any).userSession.update({
      where: { sessionId: dto.sessionId },
      data: { endedAt: now, durationSec },
    });

    await (this.prisma as any).analyticsEvent.create({
      data: {
        type: 'SESSION_END' as any,
        sessionId: dto.sessionId,
        userId,
        metadata: dto.metadata ?? undefined,
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
      type: AnalyticsEventType;
      feature?: FeatureKey;
      page?: string;
      referrer?: string;
      sessionId?: string;
      device?: string;
      browser?: string;
      os?: string;
      country?: string;
      boardId?: string;
      cardId?: string;
      metadata?: any;
    },
    req?: RequestLike,
  ) {
    // Validate optional foreign keys to avoid FK violations
    let boardId: string | undefined = dto.boardId;
    let cardId: string | undefined = dto.cardId;

    const checks: Promise<any>[] = [];
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
        this.prisma.card
          .findUnique({ where: { id: dto.cardId } })
          .then((c) => {
            if (!c) cardId = undefined;
          }),
      );
    }
    if (checks.length) await Promise.all(checks);

    const client = this.getClientInfo(req);

    const event = await (this.prisma as any).analyticsEvent.create({
      data: {
        type: dto.type as any,
        feature: dto.feature as any,
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
        metadata: dto.metadata ?? undefined,
      },
    });

    return { id: event.id, createdAt: event.createdAt };
  }
}
