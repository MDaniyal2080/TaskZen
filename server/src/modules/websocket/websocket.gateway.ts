import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { PrismaService } from '../../database/prisma.service';
import { SystemSettingsService } from '../../common/services/system-settings.service';

const defaultWsOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];

@WebSocketGateway({
  cors: {
    origin: ((origin, callback) => {
      const envOrigins = [process.env.FRONTEND_URL, process.env.CLIENT_URL].filter(Boolean) as string[];
      const allowed = new Set([...defaultWsOrigins, ...envOrigins]);
      const allowAll = process.env.NODE_ENV !== 'production';
      if (allowAll || !origin || allowed.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS for WebSocket'), false);
      }
    }) as any,
    credentials: true,
  },
  namespace: '/realtime',
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets: Map<string, string[]> = new Map();
  // boardId -> (userId -> set of socketIds)
  private boardPresence: Map<string, Map<string, Set<string>>> = new Map();
  // socketId -> set of boardIds the socket has joined
  private socketBoards: Map<string, Set<string>> = new Map();

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
  ) {}

  private async isRealtimeEnabled(): Promise<boolean> {
    try {
      const settings = await this.settings.getSettings();
      return Boolean((settings as any)?.features?.enableRealTimeUpdates);
    } catch {
      return true; // default to enabled if settings cannot be loaded
    }
  }

  private async canAccessBoard(userId: string, boardId: string): Promise<boolean> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: {
        ownerId: true,
        isPrivate: true,
        members: { select: { userId: true } },
      },
    });
    if (!board) return false;
    if (board.ownerId === userId || board.members.some((m) => m.userId === userId)) return true;
    if (!board.isPrivate) {
      const settings = await this.settings.getSettings();
      const publicBoardsEnabled = Boolean((settings as any)?.features?.enablePublicBoards);
      if (publicBoardsEnabled) return true;
    }
    return false;
  }

  async handleConnection(client: Socket) {
    try {
      const origin = client.handshake.headers.origin || 'unknown';
      const nsp = client.nsp?.name || 'unknown';
      const query = client.handshake?.query || {};
      this.logger.log(`WS connect id=${client.id} nsp=${nsp} origin=${origin} query=${JSON.stringify(query)}`);
    } catch (e) {
      this.logger.warn(`WS connect log failed: ${e?.message || e}`);
    }
    if (!(await this.isRealtimeEnabled())) {
      client.emit('realtimeDisabled', { message: 'Real-time updates are disabled by the administrator' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    try {
      const nsp = client.nsp?.name || 'unknown';
      this.logger.log(`WS disconnect id=${client.id} nsp=${nsp}`);
    } catch {}
    // Remove client from all user mappings
    for (const [userId, sockets] of this.userSockets.entries()) {
      const index = sockets.indexOf(client.id);
      if (index > -1) {
        sockets.splice(index, 1);
        if (sockets.length === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }

    // Remove client from any board presence it was part of
    const boards = this.socketBoards.get(client.id);
    if (boards) {
      for (const boardId of boards) {
        const usersMap = this.boardPresence.get(boardId);
        if (usersMap) {
          // Determine userId from any mapping containing this socket id
          for (const [uid, socketSet] of usersMap.entries()) {
            if (socketSet.has(client.id)) {
              socketSet.delete(client.id);
              if (socketSet.size === 0) {
                usersMap.delete(uid);
              }
              break;
            }
          }
          if (usersMap.size === 0) {
            this.boardPresence.delete(boardId);
          }
          // Broadcast updated presence for this board
          this.emitPresence(boardId);
        }
      }
      this.socketBoards.delete(client.id);
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('auth')
  async handleAuth(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
    if (!(await this.isRealtimeEnabled())) {
      client.emit('realtimeDisabled', { message: 'Real-time updates are disabled by the administrator' });
      return;
    }
    const { userId } = data;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, []);
    }
    this.userSockets.get(userId)?.push(client.id);
    client.join(`user-${userId}`);
    client.emit('authSuccess', { message: 'Authenticated successfully' });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinBoard')
  async handleJoinBoard(@ConnectedSocket() client: Socket, @MessageBody() data: { boardId: string }) {
    if (!(await this.isRealtimeEnabled())) {
      client.emit('realtimeDisabled', { message: 'Real-time updates are disabled by the administrator' });
      return;
    }
    const boardId = data.boardId;
    const userId = (client.data?.user?.sub as string) || '';

    if (!userId || !(await this.canAccessBoard(userId, boardId))) {
      client.emit('accessDenied', { message: 'You do not have access to this board' });
      return;
    }

    client.join(`board-${boardId}`);

    // Track which boards this socket has joined
    const set = this.socketBoards.get(client.id) || new Set<string>();
    set.add(boardId);
    this.socketBoards.set(client.id, set);

    // Track presence: add this socket under the authenticated user id
    if (userId) {
      if (!this.boardPresence.has(boardId)) this.boardPresence.set(boardId, new Map());
      const userSockets = this.boardPresence.get(boardId)!;
      const socketSet = userSockets.get(userId) || new Set<string>();
      socketSet.add(client.id);
      userSockets.set(userId, socketSet);
      this.boardPresence.set(boardId, userSockets);
      // Emit updated presence to the board
      this.emitPresence(boardId);
    }

    client.emit('joinedBoard', { boardId });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leaveBoard')
  async handleLeaveBoard(@ConnectedSocket() client: Socket, @MessageBody() data: { boardId: string }) {
    const boardId = data.boardId;
    client.leave(`board-${boardId}`);

    // Update socket->boards mapping
    const boards = this.socketBoards.get(client.id);
    if (boards) {
      boards.delete(boardId);
      if (boards.size === 0) this.socketBoards.delete(client.id);
      else this.socketBoards.set(client.id, boards);
    }

    // Update presence map
    const userId = (client.data?.user?.sub as string) || '';
    if (userId && this.boardPresence.has(boardId)) {
      const userSockets = this.boardPresence.get(boardId)!;
      const socketSet = userSockets.get(userId);
      if (socketSet) {
        socketSet.delete(client.id);
        if (socketSet.size === 0) userSockets.delete(userId);
      }
      if (userSockets.size === 0) this.boardPresence.delete(boardId);
      else this.boardPresence.set(boardId, userSockets);
      this.emitPresence(boardId);
    }

    client.emit('leftBoard', { boardId });
  }

  // Emit events to specific boards
  async emitToBoardMembers(boardId: string, event: string, data: any) {
    if (!(await this.isRealtimeEnabled())) return;
    this.server.to(`board-${boardId}`).emit(event, data);
  }

  // Emit events to specific users
  async emitToUser(userId: string, event: string, data: any) {
    if (!(await this.isRealtimeEnabled())) return;
    this.server.to(`user-${userId}`).emit(event, data);
  }

  // Board update events
  notifyBoardUpdate(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'boardUpdated', data);
  }

  notifyBoardDeleted(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'boardDeleted', data);
  }

  notifyListCreated(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'listCreated', data);
  }

  notifyListUpdated(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'listUpdated', data);
  }

  notifyListDeleted(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'listDeleted', data);
  }

  notifyCardCreated(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'cardCreated', data);
  }

  notifyCardUpdated(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'cardUpdated', data);
  }

  notifyCardMoved(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'cardMoved', data);
  }

  notifyCardDeleted(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'cardDeleted', data);
  }

  // Comment events
  notifyCommentCreated(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'commentCreated', data);
  }

  notifyCommentUpdated(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'commentUpdated', data);
  }

  notifyCommentDeleted(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'commentDeleted', data);
  }

  notifyMemberAdded(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'memberAdded', data);
  }

  notifyMemberRemoved(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'memberRemoved', data);
  }

  // Activity events
  notifyActivityCreated(boardId: string, data: any) {
    this.emitToBoardMembers(boardId, 'activityCreated', data);
  }

  // Helper to broadcast presence list for a board
  private emitPresence(boardId: string) {
    const usersMap = this.boardPresence.get(boardId);
    const userIds = usersMap ? Array.from(usersMap.keys()) : [];
    this.emitToBoardMembers(boardId, 'presenceUpdated', { boardId, userIds });
  }

  // Typing indicators
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typingStart')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId: string; cardId?: string },
  ) {
    const userId = (client.data?.user?.sub as string) || '';
    if (!data?.boardId || !userId) return;
    if (!(await this.isRealtimeEnabled())) return;
    if (!(await this.canAccessBoard(userId, data.boardId))) return;
    this.emitToBoardMembers(data.boardId, 'typingStarted', {
      userId,
      boardId: data.boardId,
      cardId: data.cardId,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typingStop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId: string; cardId?: string },
  ) {
    const userId = (client.data?.user?.sub as string) || '';
    if (!data?.boardId || !userId) return;
    if (!(await this.isRealtimeEnabled())) return;
    if (!(await this.canAccessBoard(userId, data.boardId))) return;
    this.emitToBoardMembers(data.boardId, 'typingStopped', {
      userId,
      boardId: data.boardId,
      cardId: data.cardId,
    });
  }
}
