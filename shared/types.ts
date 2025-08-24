// Shared types between client and server. Keep in sync with Prisma schema.

export type UserRole = 'USER' | 'ADMIN'
export type BoardMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface User {
  id: string
  email: string
  username: string
  firstName?: string | null
  lastName?: string | null
  avatar?: string | null
  role: UserRole
  isPro: boolean
  proExpiresAt?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  user: User
  token: string
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
  firstName?: string
  lastName?: string
}

export interface BoardMember {
  id: string
  role: BoardMemberRole
  joinedAt: string
  userId: string
  boardId: string
  user?: User
}

export interface Label {
  id: string
  name: string
  color: string
  createdAt: string
  boardId: string
}

export interface Attachment {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  url: string
  createdAt: string
  cardId: string
}

export interface Comment {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  cardId: string
  authorId: string
}

export interface CardLabel {
  cardId: string
  labelId: string
}

export interface Card {
  id: string
  title: string
  description?: string | null
  position: number
  dueDate?: string | null
  isCompleted: boolean
  isArchived: boolean
  priority: Priority
  color?: string | null
  createdAt: string
  updatedAt: string
  listId: string
  assigneeId?: string | null
  // Optional denormalized fields when used on client
  labels?: Label[]
  attachments?: Attachment[]
  comments?: Comment[]
  boardId?: string
}

export interface List {
  id: string
  title: string
  position: number
  isArchived: boolean
  createdAt: string
  updatedAt: string
  boardId: string
  cards?: Card[]
}

export interface Board {
  id: string
  title: string
  description?: string | null
  color: string
  background?: string | null
  theme: string
  isPrivate: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  ownerId: string
  members?: BoardMember[]
  lists?: List[]
  labels?: Label[]
}
