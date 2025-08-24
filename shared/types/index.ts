// User types
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
  uiPreferences?: UiPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

// UI Preferences
export interface UiPreferences {
  board?: BoardUiPreferences;
}

export interface BoardUiPreferences {
  compactCardView?: boolean;
  alwaysShowLabels?: boolean;
  enableAnimations?: boolean;
}

// Board types
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
  role: BoardMemberRole;
  userId: string;
  boardId: string;
  user?: User;
  board?: Board;
  joinedAt: Date;
}

export enum BoardMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER'
}

// List types
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

// Card types
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
  assigneeId?: string;
  list?: List;
  assignee?: User;
  labels?: CardLabel[];
  attachments?: Attachment[];
  comments?: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

// Label types
export interface Label {
  id: string;
  name: string;
  color: string;
  boardId: string;
  createdAt: Date;
}

export interface CardLabel {
  cardId: string;
  labelId: string;
  card?: Card;
  label?: Label;
}

// Attachment types
export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  cardId: string;
  card?: Card;
  createdAt: Date;
}

// Comment types
export interface Comment {
  id: string;
  content: string;
  cardId: string;
  authorId: string;
  card?: Card;
  author?: User;
  createdAt: Date;
  updatedAt: Date;
}

// Activity types
export interface Activity {
  id: string;
  type: ActivityType;
  data: any;
  userId?: string;
  boardId?: string;
  cardId?: string;
  user?: User;
  board?: Board;
  card?: Card;
  createdAt: Date;
}

export enum ActivityType {
  BOARD_CREATED = 'BOARD_CREATED',
  BOARD_UPDATED = 'BOARD_UPDATED',
  BOARD_DELETED = 'BOARD_DELETED',
  LIST_CREATED = 'LIST_CREATED',
  LIST_UPDATED = 'LIST_UPDATED',
  LIST_DELETED = 'LIST_DELETED',
  CARD_CREATED = 'CARD_CREATED',
  CARD_UPDATED = 'CARD_UPDATED',
  CARD_MOVED = 'CARD_MOVED',
  CARD_DELETED = 'CARD_DELETED',
  MEMBER_ADDED = 'MEMBER_ADDED',
  MEMBER_REMOVED = 'MEMBER_REMOVED',
  COMMENT_ADDED = 'COMMENT_ADDED'
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// Drag and Drop types
export interface DragEndEvent {
  active: {
    id: string;
    data: {
      current: {
        type: 'card' | 'list';
        card?: Card;
        list?: List;
      };
    };
  };
  over: {
    id: string;
    data: {
      current: {
        type: 'card' | 'list';
        accepts?: string[];
      };
    };
  } | null;
}

// Form types
export interface CreateBoardForm {
  title: string;
  description?: string;
  color: string;
  isPrivate: boolean;
}

export interface CreateListForm {
  title: string;
  boardId: string;
}

export interface CreateCardForm {
  title: string;
  description?: string;
  listId: string;
  dueDate?: Date;
  priority: Priority;
  assigneeId?: string;
}

export interface UpdateCardForm {
  title?: string;
  description?: string;
  dueDate?: Date;
  priority?: Priority;
  assigneeId?: string;
  isCompleted?: boolean;
}
