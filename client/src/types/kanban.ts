// Centralized Kanban UI types
// These types are used across Kanban components to ensure consistent typing
// for cards and labels in the client UI layer.

import type { Card as CardType, Label, User } from '@/shared/types';

// Labels may arrive from the API/store either as denormalized Label objects
// or as relation objects of the form { label: Label }.
export type LabelOrRelation = Label | { label: Label };

// CardView represents the shape consumed by UI components.
// It is based on the shared Card model but adjusts the labels field to accept
// both denormalized and relational forms, and optionally includes _count and assignee.
export type CardView = Omit<CardType, 'labels'> & {
  _count?: { comments?: number; attachments?: number } | null;
  labels?: LabelOrRelation[];
  assignee?: User;
};
