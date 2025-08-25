'use client';

import React, { useState } from 'react';
import { UserPlus, X, Shield, Eye, Users, Crown } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { BoardPayload, BoardMemberPayload } from '@/store/board-store';
import type { User } from '@/shared/types';

interface BoardMembersProps {
  boardId: string;
  board: BoardPayload | null;
  currentUserId: string;
  onMembersUpdate?: () => void;
}

export function BoardMembers({ boardId, board, currentUserId, onMembersUpdate }: BoardMembersProps) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN' | 'VIEWER'>('MEMBER');
  const [loading, setLoading] = useState(false);

  const members: BoardMemberPayload[] = Array.isArray(board?.members) ? (board!.members as BoardMemberPayload[]) : [];
  const isOwner = board?.ownerId === currentUserId;
  const currentMember = members.find((m) => m.userId === currentUserId);
  const canManageMembers = isOwner || currentMember?.role === 'ADMIN';

  const roleIcons = {
    OWNER: <Crown className="w-4 h-4" />,
    ADMIN: <Shield className="w-4 h-4" />,
    MEMBER: <Users className="w-4 h-4" />,
    VIEWER: <Eye className="w-4 h-4" />
  };

  const roleColors = {
    OWNER: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    ADMIN: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    MEMBER: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    VIEWER: 'text-gray-600 bg-gray-100 dark:bg-gray-900/30'
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    try {
      setLoading(true);
      
      // First, find user by email from all users
      const { data: allUsers } = await api.get<User[]>('/users');
      const user = allUsers.find((u) => u.email.toLowerCase() === inviteEmail.toLowerCase());
      
      if (!user) {
        toast.error('User not found with this email');
        return;
      }

      const userId = user.id;

      // Add member to board
      await api.post(`/boards/${boardId}/members`, {
        userId,
        role: inviteRole
      });

      toast.success('Member added successfully');
      setInviteEmail('');
      setShowInvite(false);
      
      if (onMembersUpdate) {
        onMembersUpdate();
      }
    } catch (error: unknown) {
      console.error('Failed to add member:', error);
      const message = (() => {
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
        const maybe = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        return typeof maybe === 'string' ? maybe : 'Failed to add member';
      })();
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId?: string) => {
    if (!userId) return;
    if (!window.confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/boards/${boardId}/members/${userId}`);
      toast.success('Member removed successfully');
      
      if (onMembersUpdate) {
        onMembersUpdate();
      }
    } catch (error: unknown) {
      console.error('Failed to remove member:', error);
      const message = (() => {
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
        const maybe = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        return typeof maybe === 'string' ? maybe : 'Failed to remove member';
      })();
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const displayName = (user?: { firstName?: string; lastName?: string; username?: string } | null) => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user?.firstName || user?.username || 'User';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Board Members</h3>
        {canManageMembers && (
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        )}
      </div>

      {/* Invite Form */}
      {showInvite && canManageMembers && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN' | 'VIEWER')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                disabled={loading}
              >
                <option value="MEMBER">Member - Can create and edit cards</option>
                <option value="ADMIN">Admin - Can manage board and members</option>
                <option value="VIEWER">Viewer - Can only view</option>
              </select>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleInviteMember}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Member'}
              </button>
              <button
                onClick={() => {
                  setShowInvite(false);
                  setInviteEmail('');
                }}
                disabled={loading}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="space-y-2">
        {/* Board Owner */}
        {board?.owner && (
          <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={board.owner?.avatar} alt={displayName(board.owner)} />
                <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                  {((board.owner?.firstName?.[0] || board.owner?.username?.[0] || '?') as string).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium text-slate-900 dark:text-white">
                  {displayName(board.owner)}
                  {board.owner?.id === currentUserId && (
                    <span className="ml-2 text-sm text-slate-500">(You)</span>
                  )}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {board.owner?.email}
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${roleColors.OWNER}`}>
              {roleIcons.OWNER}
              Owner
            </div>
          </div>
        )}

        {/* Other Members */}
        {members
          .filter((m) => m.userId !== board?.ownerId)
          .map((member, idx) => {
            const roleKey: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' =
              member.role === 'OWNER' || member.role === 'ADMIN' || member.role === 'MEMBER' || member.role === 'VIEWER'
                ? (member.role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER')
                : 'MEMBER';
            return (
            <div
              key={(member.userId || member.id || member.user?.id || `m-${idx}`) as string}
              className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={member.user?.avatar} alt={displayName(member.user)} />
                  <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                    {((member.user?.firstName?.[0] || member.user?.username?.[0] || '?') as string).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {displayName(member.user)}
                    {member.userId === currentUserId && (
                      <span className="ml-2 text-sm text-slate-500">(You)</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {member.user?.email}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${roleColors[roleKey]}`}>
                  {roleIcons[roleKey]}
                  {roleKey.charAt(0) + roleKey.slice(1).toLowerCase()}
                </div>
                
                {canManageMembers && member.userId !== currentUserId && (
                  <button
                    onClick={() => handleRemoveMember(member.userId)}
                    disabled={loading}
                    className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            );
          })}
      </div>

      {members.length === 0 && !board?.owner && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          No members yet
        </div>
      )}
    </div>
  );
}
