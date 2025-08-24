import { api } from './api'
import type { Board } from '@/shared/types'

export async function getBoards() {
  const { data } = await api.get<Board[]>('/boards')
  return data
}

export async function getBoard(id: string) {
  const { data } = await api.get<Board>(`/boards/${id}`)
  return data
}

// Board Templates
export interface BoardTemplate {
  id: string
  name: string
  description: string
  icon: string
  color: string
  lists: Array<{
    title: string
    position: number
    cards?: Array<{
      title: string
      description?: string
      position: number
    }>
  }>
  isCustom?: boolean
}

export async function getBoardTemplates() {
  const { data } = await api.get<BoardTemplate[]>('/boards/templates')
  return data
}

export async function saveAsTemplate(boardId: string) {
  const { data } = await api.post<BoardTemplate>(`/boards/${boardId}/save-as-template`)
  return data
}

// Create Board
export interface CreateBoardInput {
  title: string
  description?: string
  color?: string
  background?: string
  theme?: string
  isPrivate?: boolean
  templateId?: string
}

export async function createBoard(payload: CreateBoardInput) {
  const { data } = await api.post<Board>('/boards', payload)
  return data
}

// Predefined themes and backgrounds
export const BOARD_THEMES = [
  { id: 'default', name: 'Default', colors: { primary: '#6366f1', secondary: '#e2e8f0' } },
  { id: 'ocean', name: 'Ocean', colors: { primary: '#0ea5e9', secondary: '#bae6fd' } },
  { id: 'forest', name: 'Forest', colors: { primary: '#10b981', secondary: '#a7f3d0' } },
  { id: 'sunset', name: 'Sunset', colors: { primary: '#f59e0b', secondary: '#fef3c7' } },
  { id: 'lavender', name: 'Lavender', colors: { primary: '#8b5cf6', secondary: '#e9d5ff' } },
  { id: 'rose', name: 'Rose', colors: { primary: '#f43f5e', secondary: '#fecdd3' } },
]

export const BOARD_BACKGROUNDS = [
  { id: 'none', name: 'None', url: null },
  { id: 'gradient-blue', name: 'Blue Gradient', url: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'gradient-green', name: 'Green Gradient', url: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { id: 'gradient-purple', name: 'Purple Gradient', url: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'gradient-orange', name: 'Orange Gradient', url: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
  { id: 'pattern-dots', name: 'Dots Pattern', url: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)' },
]

// Built-in templates (shown in the Template gallery)
export const BUILT_IN_TEMPLATES: BoardTemplate[] = [
  {
    id: 'kanban-basic',
    name: 'Basic Kanban',
    description: 'Simple workflow with To Do, In Progress, and Done',
    icon: 'Layout',
    color: 'indigo',
    isCustom: false,
    lists: [
      { title: 'To Do', position: 0 },
      { title: 'In Progress', position: 1 },
      { title: 'Done', position: 2 },
    ],
  },
  {
    id: 'scrum-sprint',
    name: 'Scrum Sprint',
    description: 'Agile sprint board with backlog and review stages',
    icon: 'Zap',
    color: 'purple',
    isCustom: false,
    lists: [
      { title: 'Backlog', position: 0 },
      { title: 'Sprint Planning', position: 1 },
      { title: 'In Development', position: 2 },
      { title: 'Code Review', position: 3 },
      { title: 'Testing', position: 4 },
      { title: 'Done', position: 5 },
    ],
  },
  {
    id: 'project-management',
    name: 'Project Management',
    description: 'Complete project lifecycle management',
    icon: 'Briefcase',
    color: 'blue',
    isCustom: false,
    lists: [
      { title: 'Ideas', position: 0 },
      { title: 'Planning', position: 1 },
      { title: 'In Progress', position: 2 },
      { title: 'Review', position: 3 },
      { title: 'Completed', position: 4 },
      { title: 'Archived', position: 5 },
    ],
  },
  {
    id: 'software-development',
    name: 'Software Development',
    description: 'Software development workflow with bug tracking',
    icon: 'Code',
    color: 'green',
    isCustom: false,
    lists: [
      { title: 'Backlog', position: 0 },
      { title: 'Design', position: 1 },
      { title: 'Development', position: 2 },
      { title: 'Testing', position: 3 },
      { title: 'Deployment', position: 4 },
      { title: 'Bug Fixes', position: 5 },
    ],
  },
  {
    id: 'content-calendar',
    name: 'Content Calendar',
    description: 'Editorial calendar for content creation',
    icon: 'Calendar',
    color: 'yellow',
    isCustom: false,
    lists: [
      { title: 'Ideas', position: 0 },
      { title: 'Research', position: 1 },
      { title: 'Writing', position: 2 },
      { title: 'Editing', position: 3 },
      { title: 'Ready to Publish', position: 4 },
      { title: 'Published', position: 5 },
    ],
  },
  {
    id: 'sales-pipeline',
    name: 'Sales Pipeline',
    description: 'Track leads through your sales process',
    icon: 'ShoppingCart',
    color: 'orange',
    isCustom: false,
    lists: [
      { title: 'Leads', position: 0 },
      { title: 'Qualified', position: 1 },
      { title: 'Proposal', position: 2 },
      { title: 'Negotiation', position: 3 },
      { title: 'Closed Won', position: 4 },
      { title: 'Closed Lost', position: 5 },
    ],
  },
  {
    id: 'education',
    name: 'Education & Learning',
    description: 'Track courses, assignments, and study progress',
    icon: 'GraduationCap',
    color: 'pink',
    isCustom: false,
    lists: [
      { title: 'To Learn', position: 0 },
      { title: 'Learning', position: 1 },
      { title: 'Practice', position: 2 },
      { title: 'Review', position: 3 },
      { title: 'Completed', position: 4 },
    ],
  },
  {
    id: 'goal-tracking',
    name: 'Goal Tracking',
    description: 'Track personal or team goals and objectives',
    icon: 'Target',
    color: 'red',
    isCustom: false,
    lists: [
      { title: 'Goals', position: 0 },
      { title: 'This Week', position: 1 },
      { title: 'In Progress', position: 2 },
      { title: 'Blocked', position: 3 },
      { title: 'Achieved', position: 4 },
    ],
  },
]
