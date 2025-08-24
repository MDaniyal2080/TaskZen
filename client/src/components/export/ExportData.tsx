'use client';

import React, { useState } from 'react';
import { 
  Download, FileText, FileSpreadsheet, FileJson, 
  Image, Calendar, Check, X, AlertCircle 
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { LoadingButton } from '@/components/loading/LoadingStates';

interface ExportOptions {
  format: 'json' | 'csv' | 'pdf' | 'markdown' | 'excel';
  includeComments: boolean;
  includeAttachments: boolean;
  includeActivity: boolean;
  includeArchived: boolean;
  dateRange?: {
    from: Date;
    to: Date;
  };
}

interface ExportDataProps {
  boardId?: string;
  cardId?: string;
  scope: 'board' | 'card' | 'workspace' | 'user';
}

export function ExportData({ boardId, cardId, scope }: ExportDataProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    format: 'json',
    includeComments: true,
    includeAttachments: false,
    includeActivity: false,
    includeArchived: false,
  });

  const formatInfo = {
    json: {
      icon: FileJson,
      name: 'JSON',
      description: 'Machine-readable format, preserves all data structure',
      mimeType: 'application/json',
      extension: '.json',
    },
    csv: {
      icon: FileSpreadsheet,
      name: 'CSV',
      description: 'Spreadsheet format, compatible with Excel',
      mimeType: 'text/csv',
      extension: '.csv',
    },
    pdf: {
      icon: FileText,
      name: 'PDF',
      description: 'Printable document format',
      mimeType: 'application/pdf',
      extension: '.pdf',
    },
    markdown: {
      icon: FileText,
      name: 'Markdown',
      description: 'Plain text with formatting',
      mimeType: 'text/markdown',
      extension: '.md',
    },
    excel: {
      icon: FileSpreadsheet,
      name: 'Excel',
      description: 'Microsoft Excel workbook',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: '.xlsx',
    },
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let endpoint = '';
      const params: any = {
        format: options.format,
        includeComments: options.includeComments,
        includeAttachments: options.includeAttachments,
        includeActivity: options.includeActivity,
        includeArchived: options.includeArchived,
      };

      if (options.dateRange) {
        params.fromDate = options.dateRange.from.toISOString();
        params.toDate = options.dateRange.to.toISOString();
      }

      switch (scope) {
        case 'board':
          endpoint = `/boards/${boardId}/export`;
          break;
        case 'card':
          endpoint = `/cards/${cardId}/export`;
          break;
        case 'workspace':
          endpoint = '/export/workspace';
          break;
        case 'user':
          endpoint = '/export/user-data';
          break;
      }

      const response = await api.get(endpoint, {
        params,
        responseType: 'blob',
      });

      // Create download link
      const blob = new Blob([response.data], { 
        type: formatInfo[options.format].mimeType 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = format(new Date(), 'yyyy-MM-dd-HHmm');
      const filename = `taskzen-${scope}-${timestamp}${formatInfo[options.format].extension}`;
      link.setAttribute('download', filename);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Data exported successfully as ${formatInfo[options.format].name}`);
      setShowOptions(false);
    } catch (error: any) {
      console.error('Export failed:', error);
      toast.error(error.response?.data?.message || 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkExport = async () => {
    setIsExporting(true);
    try {
      // Export all formats
      const formats: ExportOptions['format'][] = ['json', 'csv', 'pdf', 'markdown'];
      const exports = formats.map(f => 
        handleSingleExport(f)
      );
      
      await Promise.all(exports);
      toast.success('All formats exported successfully');
    } catch (error) {
      toast.error('Some exports failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSingleExport = async (fmt: ExportOptions['format']) => {
    const params: any = {
      format: fmt,
      includeComments: options.includeComments,
      includeAttachments: options.includeAttachments,
      includeActivity: options.includeActivity,
      includeArchived: options.includeArchived,
    };

    let endpoint = '';
    switch (scope) {
      case 'board':
        endpoint = `/boards/${boardId}/export`;
        break;
      case 'card':
        endpoint = `/cards/${cardId}/export`;
        break;
      case 'workspace':
        endpoint = '/export/workspace';
        break;
      case 'user':
        endpoint = '/export/user-data';
        break;
    }

    const response = await api.get(endpoint, {
      params,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { 
      type: formatInfo[fmt].mimeType 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmm');
    const filename = `taskzen-${scope}-${timestamp}${formatInfo[fmt].extension}`;
    link.setAttribute('download', filename);
    
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const getScopeLabel = () => {
    switch (scope) {
      case 'board':
        return 'Board';
      case 'card':
        return 'Card';
      case 'workspace':
        return 'Workspace';
      case 'user':
        return 'All User Data';
      default:
        return 'Data';
    }
  };

  return (
    <>
      {/* Export Button */}
      <button
        onClick={() => setShowOptions(!showOptions)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        aria-label={`Export ${getScopeLabel()}`}
      >
        <Download className="h-4 w-4" />
        Export {getScopeLabel()}
      </button>

      {/* Export Options Modal */}
      {showOptions && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowOptions(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Export {getScopeLabel()}</h2>
                  <button
                    onClick={() => setShowOptions(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    aria-label="Close export options"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Format Selection */}
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium mb-3">Export Format</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(formatInfo).map(([key, info]) => {
                      const Icon = info.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => setOptions(prev => ({ ...prev, format: key as any }))}
                          className={`
                            p-3 rounded-lg border-2 transition-all text-left
                            ${options.format === key
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }
                          `}
                        >
                          <div className="flex items-start gap-3">
                            <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm">{info.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {info.description}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Include Options */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Include in Export</h3>
                  <div className="space-y-2">
                    {[
                      { key: 'includeComments', label: 'Comments', icon: MessageSquare },
                      { key: 'includeAttachments', label: 'Attachment Links', icon: Paperclip },
                      { key: 'includeActivity', label: 'Activity History', icon: Activity },
                      { key: 'includeArchived', label: 'Archived Items', icon: Archive },
                    ].map(({ key, label, icon: Icon }) => (
                      <label
                        key={key}
                        className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={options[key as keyof ExportOptions] as boolean}
                          onChange={(e) => setOptions(prev => ({ 
                            ...prev, 
                            [key]: e.target.checked 
                          }))}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <Icon className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Date Range (optional) */}
                {scope !== 'card' && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Date Range (Optional)</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="from-date" className="block text-xs text-gray-500 mb-1">
                          From
                        </label>
                        <input
                          id="from-date"
                          type="date"
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            dateRange: {
                              from: new Date(e.target.value),
                              to: prev.dateRange?.to || new Date(),
                            }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="to-date" className="block text-xs text-gray-500 mb-1">
                          To
                        </label>
                        <input
                          id="to-date"
                          type="date"
                          onChange={(e) => setOptions(prev => ({
                            ...prev,
                            dateRange: {
                              from: prev.dateRange?.from || new Date(),
                              to: new Date(e.target.value),
                            }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Export Info */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                      <p className="font-medium mb-1">Export Information</p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>Exports may take a moment for large datasets</li>
                        <li>PDF exports are limited to 100 pages</li>
                        <li>Attachment files are not included, only links</li>
                        <li>All times are in your local timezone</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
                <button
                  onClick={() => setShowOptions(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <LoadingButton
                  loading={isExporting}
                  onClick={handleExport}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  <Download className="h-4 w-4" />
                  Export {formatInfo[options.format].name}
                </LoadingButton>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Quick export button for toolbar
export function QuickExport({ boardId }: { boardId: string }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleQuickExport = async () => {
    setIsExporting(true);
    try {
      const response = await api.get(`/boards/${boardId}/export`, {
        params: { format: 'json', includeComments: true },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = format(new Date(), 'yyyy-MM-dd-HHmm');
      link.setAttribute('download', `taskzen-board-${timestamp}.json`);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Board exported successfully');
    } catch (error) {
      toast.error('Failed to export board');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleQuickExport}
      disabled={isExporting}
      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
      aria-label="Quick export board"
    >
      {isExporting ? (
        <div className="animate-spin h-5 w-5 border-2 border-gray-500 border-t-transparent rounded-full" />
      ) : (
        <Download className="h-5 w-5" />
      )}
    </button>
  );
}

// Missing import fix
const Archive = FileText;
const Paperclip = FileText;
const MessageSquare = FileText;
const Activity = Calendar;
