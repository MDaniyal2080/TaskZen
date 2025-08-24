'use client';

import React, { useState, useEffect } from 'react';
import { 
  Layout, Plus, X, 
  Briefcase, Code, Calendar, ShoppingCart, GraduationCap,
  Target, Users, Zap
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  lists: {
    title: string;
    position: number;
    cards?: {
      title: string;
      description?: string;
      position: number;
    }[];
  }[];
  isCustom?: boolean;
}

const defaultTemplates: BoardTemplate[] = [
  {
    id: 'kanban-basic',
    name: 'Basic Kanban',
    description: 'Simple workflow with To Do, In Progress, and Done',
    icon: 'Layout',
    color: 'indigo',
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
    lists: [
      { title: 'Goals', position: 0 },
      { title: 'This Week', position: 1 },
      { title: 'In Progress', position: 2 },
      { title: 'Blocked', position: 3 },
      { title: 'Achieved', position: 4 },
    ],
  },
];

export function BoardTemplates({ onSelect }: { onSelect?: (template: BoardTemplate) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplate | null>(null);
  const [customTemplates, setCustomTemplates] = useState<BoardTemplate[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [boardName, setBoardName] = useState('');

  // Load custom templates saved by the user
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/boards/templates');
        if (mounted) setCustomTemplates(res.data || []);
      } catch (e) {
        console.error('Failed to load templates', e);
      }
    })();
    return () => { mounted = false };
  }, []);

  const getIcon = (iconName: string) => {
    const icons: Record<string, React.ElementType> = {
      Layout, Briefcase, Code, Calendar, ShoppingCart, 
      GraduationCap, Target, Users, Zap
    };
    return icons[iconName] || Layout;
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
      red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return colors[color] || colors.indigo;
  };

  const createBoardFromTemplate = async () => {
    if (!selectedTemplate || !boardName.trim()) {
      toast.error('Please select a template and enter a board name');
      return;
    }

    setIsCreating(true);
    try {
      const response = await api.post('/boards', {
        title: boardName,
        description: `Created from ${selectedTemplate.name} template`,
      });

      const boardId = response.data.id;

      // Create lists from template
      for (const list of selectedTemplate.lists) {
        const listResponse = await api.post('/lists', {
          title: list.title,
          boardId,
          position: list.position,
        });

        // Create sample cards if provided
        if (list.cards) {
          for (const card of list.cards) {
            await api.post('/cards', {
              title: card.title,
              description: card.description,
              listId: listResponse.data.id,
              position: card.position,
            });
          }
        }
      }

      toast.success('Board created successfully from template!');
      // Invalidate boards list cache so it reflects the new board
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      router.push(`/boards/${boardId}`);
    } catch (error) {
      console.error('Failed to create board from template:', error);
      toast.error('Failed to create board');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Board Templates</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Choose a template to quickly set up your board
        </p>
      </div>

      {/* Selected Template and Board Name */}
      {selectedTemplate && (
        <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${getColorClasses(selectedTemplate.color)}`}>
                {React.createElement(getIcon(selectedTemplate.icon), { className: 'h-5 w-5' })}
              </div>
              <div>
                <h3 className="font-semibold">{selectedTemplate.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedTemplate.description}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedTemplate(null);
                setBoardName('');
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="Enter board name..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && boardName.trim()) {
                  createBoardFromTemplate();
                }
              }}
            />
            <button
              onClick={createBoardFromTemplate}
              disabled={!boardName.trim() || isCreating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Board
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Template Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {defaultTemplates.map((template) => (
          <div
            key={template.id}
            onClick={() => {
              setSelectedTemplate(template);
              if (onSelect) onSelect(template);
            }}
            className={`
              p-4 bg-white dark:bg-gray-900 rounded-lg border-2 cursor-pointer transition-all
              ${selectedTemplate?.id === template.id 
                ? 'border-indigo-500 shadow-lg' 
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`p-2 rounded-lg ${getColorClasses(template.color)}`}>
                {React.createElement(getIcon(template.icon), { className: 'h-5 w-5' })}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{template.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {template.description}
                </p>
              </div>
            </div>

            {/* Preview Lists */}
            <div className="flex gap-1 mt-3">
              {template.lists.slice(0, 4).map((list, index) => (
                <div
                  key={index}
                  className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full"
                  title={list.title}
                />
              ))}
              {template.lists.length > 4 && (
                <span className="text-xs text-gray-500 ml-1">
                  +{template.lists.length - 4}
                </span>
              )}
            </div>

            {/* List Names */}
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {template.lists.map(l => l.title).join(' → ')}
            </div>
          </div>
        ))}

        {/* Custom Templates */}
        {customTemplates.map((template) => (
          <div
            key={template.id}
            onClick={() => {
              setSelectedTemplate(template);
              if (onSelect) onSelect(template);
            }}
            className={`
              p-4 bg-white dark:bg-gray-900 rounded-lg border-2 cursor-pointer transition-all relative
              ${selectedTemplate?.id === template.id 
                ? 'border-indigo-500 shadow-lg' 
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <div className="absolute top-2 right-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded">
              Custom
            </div>
            <div className="flex items-start gap-3 mb-3">
              <div className={`p-2 rounded-lg ${getColorClasses(template.color)}`}>
                {React.createElement(getIcon(template.icon), { className: 'h-5 w-5' })}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{template.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {template.description}
                </p>
              </div>
            </div>

            <div className="flex gap-1 mt-3">
              {template.lists.slice(0, 4).map((list, index) => (
                <div
                  key={index}
                  className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full"
                  title={list.title}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Create Custom Template */}
        <div
          className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex items-center justify-center min-h-[150px]"
          onClick={() => toast('Save any board as a template from the board menu')}
        >
          <div className="text-center">
            <Plus className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create Custom Template
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
