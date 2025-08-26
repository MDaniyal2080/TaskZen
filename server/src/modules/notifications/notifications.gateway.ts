import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";

@WebSocketGateway({
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger("NotificationsGateway");

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("join-board")
  handleJoinBoard(
    @MessageBody() data: { boardId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`board-${data.boardId}`);
    this.logger.log(`Client ${client.id} joined board ${data.boardId}`);
  }

  @SubscribeMessage("leave-board")
  handleLeaveBoard(
    @MessageBody() data: { boardId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`board-${data.boardId}`);
    this.logger.log(`Client ${client.id} left board ${data.boardId}`);
  }

  // Emit events to all clients in a board
  emitToBoardMembers(boardId: string, event: string, data: any) {
    this.server.to(`board-${boardId}`).emit(event, data);
  }

  // Board events
  emitBoardUpdated(boardId: string, board: any) {
    this.emitToBoardMembers(boardId, "board-updated", board);
  }

  emitBoardDeleted(boardId: string) {
    this.emitToBoardMembers(boardId, "board-deleted", { boardId });
  }

  // List events
  emitListCreated(boardId: string, list: any) {
    this.emitToBoardMembers(boardId, "list-created", list);
  }

  emitListUpdated(boardId: string, list: any) {
    this.emitToBoardMembers(boardId, "list-updated", list);
  }

  emitListDeleted(boardId: string, listId: string) {
    this.emitToBoardMembers(boardId, "list-deleted", { listId });
  }

  // Card events
  emitCardCreated(boardId: string, card: any) {
    this.emitToBoardMembers(boardId, "card-created", card);
  }

  emitCardUpdated(boardId: string, card: any) {
    this.emitToBoardMembers(boardId, "card-updated", card);
  }

  emitCardMoved(boardId: string, card: any) {
    this.emitToBoardMembers(boardId, "card-moved", card);
  }

  emitCardDeleted(boardId: string, cardId: string) {
    this.emitToBoardMembers(boardId, "card-deleted", { cardId });
  }

  // Comment events
  emitCommentAdded(boardId: string, comment: any) {
    this.emitToBoardMembers(boardId, "comment-added", comment);
  }

  // Member events
  emitMemberAdded(boardId: string, member: any) {
    this.emitToBoardMembers(boardId, "member-added", member);
  }

  emitMemberRemoved(boardId: string, memberId: string) {
    this.emitToBoardMembers(boardId, "member-removed", { memberId });
  }
}
