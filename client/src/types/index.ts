export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum BoardMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum ActivityType {
  BOARD_CREATED = 'BOARD_CREATED',
  BOARD_UPDATED = 'BOARD_UPDATED',
  LIST_CREATED = 'LIST_CREATED',
  LIST_UPDATED = 'LIST_UPDATED',
  LIST_DELETED = 'LIST_DELETED',
  CARD_CREATED = 'CARD_CREATED',
  CARD_UPDATED = 'CARD_UPDATED',
  CARD_MOVED = 'CARD_MOVED',
  CARD_DELETED = 'CARD_DELETED',
  MEMBER_ADDED = 'MEMBER_ADDED',
  MEMBER_REMOVED = 'MEMBER_REMOVED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
}

export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role: UserRole;
  isPro: boolean;
  proExpiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Board {
  id: string;
  title: string;
  description?: string;
  color: string;
  isPrivate: boolean;
  isArchived: boolean;
  ownerId: string;
  owner?: User;
  members?: BoardMember[];
  lists?: List[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardMember {
  id: string;
  userId: string;
  boardId: string;
  role: BoardMemberRole;
  user?: User;
  board?: Board;
  joinedAt: Date;
}

export interface List {
  id: string;
  title: string;
  position: number;
  isArchived: boolean;
  boardId: string;
  board?: Board;
  cards?: Card[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  position: number;
  dueDate?: Date;
  isCompleted: boolean;
  isArchived: boolean;
  priority: Priority;
  color?: string;
  listId: string;
  list?: List;
  creatorId: string;
  creator?: User;
  assignees?: User[];
  labels?: Label[];
  attachments?: Attachment[];
  comments?: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  boardId: string;
  board?: Board;
  cards?: Card[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  cardId: string;
  card?: Card;
  uploaderId: string;
  uploader?: User;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  content: string;
  cardId: string;
  card?: Card;
  authorId: string;
  author?: User;
  createdAt: Date;
  updatedAt: Date;
}

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  userId: string;
  user?: User;
  boardId: string;
  board?: Board;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
