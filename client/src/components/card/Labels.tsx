'use client';

import React, { useState, useEffect } from 'react';
import { Tag, Plus, X, Edit2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';

interface Label {
  id: string;
  name: string;
  color: string;
  boardId: string;
}

interface LabelsProps {
  cardId: string;
  boardId: string;
}

const LABEL_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#ec4899', // pink
];

export function Labels({ cardId, boardId }: LabelsProps) {
  const [cardLabels, setCardLabels] = useState<Label[]>([]);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    fetchLabels();
  }, [cardId, boardId]);

  const fetchLabels = async () => {
    try {
      const [cardRes, boardRes] = await Promise.all([
        api.get(`/labels/card/${cardId}`),
        api.get(`/labels/board/${boardId}`),
      ]);
      setCardLabels(cardRes.data);
      setBoardLabels(boardRes.data);
    } catch (error) {
      console.error('Failed to fetch labels:', error);
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;

    try {
      const response = await api.post('/labels', {
        name: newLabelName,
        color: newLabelColor,
        boardId,
      });
      setBoardLabels([...boardLabels, response.data]);
      setNewLabelName('');
      setNewLabelColor(LABEL_COLORS[0]);
      setShowCreateForm(false);
      toast.success('Label created');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to create label');
      }
    }
  };

  const handleUpdateLabel = async (label: Label) => {
    try {
      const response = await api.patch(`/labels/${label.id}`, {
        name: label.name,
        color: label.color,
      });
      setBoardLabels(boardLabels.map(l => l.id === label.id ? response.data : l));
      setCardLabels(cardLabels.map(l => l.id === label.id ? response.data : l));
      setEditingLabel(null);
      toast.success('Label updated');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update label');
      }
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    if (!confirm('Are you sure you want to delete this label? It will be removed from all cards.')) return;

    try {
      await api.delete(`/labels/${labelId}`);
      setBoardLabels(boardLabels.filter(l => l.id !== labelId));
      setCardLabels(cardLabels.filter(l => l.id !== labelId));
      toast.success('Label deleted');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to delete label');
      }
    }
  };

  const handleToggleLabel = async (label: Label) => {
    const isAssigned = cardLabels.some(l => l.id === label.id);

    try {
      if (isAssigned) {
        await api.delete(`/labels/card/${cardId}/label/${label.id}`);
        setCardLabels(cardLabels.filter(l => l.id !== label.id));
        toast.success('Label removed');
      } else {
        await api.post(`/labels/card/${cardId}/label/${label.id}`);
        setCardLabels([...cardLabels, label]);
        toast.success('Label added');
      }
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to toggle label');
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Card Labels Display */}
      <div className="flex items-center gap-2 flex-wrap">
        {cardLabels.map(label => (
          <span
            key={label.id}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: label.color }}
          >
            {label.name}
          </span>
        ))}
        
        <button
          onClick={() => setShowLabelMenu(!showLabelMenu)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Labels
        </button>
      </div>

      {/* Label Menu */}
      {showLabelMenu && (
        <div className="relative">
          <div className="absolute left-0 top-0 z-10 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Labels</h3>
                <button
                  onClick={() => setShowLabelMenu(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
              {/* Existing Labels */}
              {boardLabels.map(label => {
                const isAssigned = cardLabels.some(l => l.id === label.id);
                const isEditing = editingLabel?.id === label.id;

                return (
                  <div key={label.id} className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={editingLabel.name}
                          onChange={(e) => setEditingLabel({ ...editingLabel, name: e.target.value })}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          {LABEL_COLORS.map(color => (
                            <button
                              key={color}
                              onClick={() => setEditingLabel({ ...editingLabel, color })}
                              className="w-4 h-4 rounded"
                              style={{ 
                                backgroundColor: color,
                                outline: editingLabel.color === color ? '2px solid #3b82f6' : 'none',
                              }}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => handleUpdateLabel(editingLabel)}
                          className="p-1 text-green-600 hover:text-green-700"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setEditingLabel(null)}
                          className="p-1 text-gray-500 hover:text-gray-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleToggleLabel(label)}
                          className="flex-1 flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <span
                            className="w-20 px-2 py-0.5 rounded-full text-xs font-medium text-white text-center"
                            style={{ backgroundColor: label.color }}
                          >
                            {label.name}
                          </span>
                          {isAssigned && <Check className="h-3 w-3 text-green-600" />}
                        </button>
                        <button
                          onClick={() => setEditingLabel(label)}
                          className="p-1 text-gray-500 hover:text-indigo-600"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteLabel(label.id)}
                          className="p-1 text-gray-500 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              {boardLabels.length === 0 && !showCreateForm && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                  No labels yet
                </p>
              )}
            </div>

            {/* Create New Label */}
            {showCreateForm ? (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                <input
                  type="text"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Label name..."
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
                <div className="flex gap-1">
                  {LABEL_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewLabelColor(color)}
                      className="w-6 h-6 rounded"
                      style={{ 
                        backgroundColor: color,
                        outline: newLabelColor === color ? '2px solid #3b82f6' : 'none',
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateLabel}
                    disabled={!newLabelName.trim()}
                    className="flex-1 px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewLabelName('');
                      setNewLabelColor(LABEL_COLORS[0]);
                    }}
                    className="flex-1 px-3 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Create new label
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
