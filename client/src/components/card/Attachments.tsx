'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Download, FileText, Image as ImageIcon, File, X } from 'lucide-react';
import NextImage from 'next/image';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useSocketStore } from '@/store/socket-store';
import { useBoardStore } from '@/store/board-store';

// Build same-origin URLs so Next.js rewrite `/uploads/*` proxies to backend

interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

interface AttachmentsProps {
  cardId: string;
}

export function Attachments({ cardId }: AttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { socket } = useSocketStore();
  const { handleCardUpdated } = useBoardStore();

  // Error helpers
  function extractErrorMessage(e: unknown, fallback: string) {
    if (
      e &&
      typeof e === 'object' &&
      'response' in e &&
      (e as { response?: { data?: { message?: unknown } } }).response
    ) {
      const msg = (e as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      if (typeof msg === 'string') return msg;
    }
    return fallback;
  }

  function isForbidden(e: unknown): boolean {
    return !!(
      e &&
      typeof e === 'object' &&
      'response' in e &&
      (e as { response?: { status?: number } }).response?.status === 403
    );
  }

  const fetchAttachments = useCallback(async () => {
    try {
      const response = await api.get(`/attachments/card/${cardId}`);
      const data = Array.isArray(response.data) ? (response.data as Attachment[]) : [];
      setAttachments(data);
    } catch (error) {
      console.error('Failed to fetch attachments:', error);
    }
  }, [cardId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // Realtime: listen for cardUpdated to sync attachments
  useEffect(() => {
    if (!socket || !cardId) return;
    const onCardUpdated = (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const rec = data as Record<string, unknown> & { id?: string; attachments?: Attachment[] };
      if (!rec.id || rec.id !== cardId) return;
      if (Array.isArray(rec.attachments)) {
        setAttachments(rec.attachments as Attachment[]);
      }
    };
    socket.on('cardUpdated', onCardUpdated);
    return () => {
      socket.off('cardUpdated', onCardUpdated);
    };
  }, [socket, cardId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploading(true);

    // Try S3 presigned upload flow first
    try {
      // 1) Ask backend for a presigned URL
      const presign = await api.post(`/attachments/card/${cardId}/presign`, {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });

      const { uploadUrl, key } = presign.data || {};
      if (!uploadUrl || !key) throw new Error('Invalid presign response');

      // 2) Upload the file directly to S3 via PUT
      const putResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putResp.ok) {
        const text = await putResp.text().catch(() => '');
        throw new Error(`S3 upload failed (${putResp.status}): ${text}`);
      }

      // 3) Notify backend to persist the attachment metadata
      const complete = await api.post(`/attachments/card/${cardId}/complete`, {
        key,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });

      const next = [complete.data as Attachment, ...attachments];
      setAttachments(next);
      // Optimistically update board store so other UI reflects changes immediately
      try { handleCardUpdated({ id: cardId, attachments: next, _count: { attachments: next.length } }); } catch {}
      toast.success('File uploaded successfully');
    } catch {
      // Fallback to legacy multipart upload for compatibility
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post(`/attachments/card/${cardId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const next = [response.data as Attachment, ...attachments];
        setAttachments(next);
        try { handleCardUpdated({ id: cardId, attachments: next, _count: { attachments: next.length } }); } catch {}
        toast.success('File uploaded successfully');
      } catch (error: unknown) {
        console.error('Upload failed:', error);
        if (isForbidden(error)) {
          toast.error('You have read-only access on this board');
        } else {
          toast.error(extractErrorMessage(error, 'Failed to upload file'));
        }
      }
    } finally {
      // Reset file input and uploading state
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      await api.delete(`/attachments/${id}`);
      const next = attachments.filter(a => a.id !== id);
      setAttachments(next);
      try { handleCardUpdated({ id: cardId, attachments: next, _count: { attachments: next.length } }); } catch {}
      toast.success('Attachment deleted');
    } catch (error: unknown) {
      if (isForbidden(error)) {
        toast.error('You have read-only access on this board');
      } else {
        toast.error(extractErrorMessage(error, 'Failed to delete attachment'));
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="h-4 w-4" />;
    }
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
      return <FileText className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  const resolveUrl = (url: string) => {
    if (/^https?:\/\//i.test(url)) return url; // absolute (e.g., S3)
    // Ensure leading slash for same-origin path; Next.js rewrites will proxy /uploads/*
    return url.startsWith('/') ? url : `/${url}`;
  };

  const getFilePreview = (attachment: Attachment) => {
    if (attachment.mimeType.startsWith('image/')) {
      return (
        <div className="relative w-full h-32">
          <NextImage
            src={resolveUrl(attachment.url)}
            alt={attachment.originalName}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover"
            priority={false}
          />
        </div>
      );
    }
    return (
      <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
        {getFileIcon(attachment.mimeType)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Paperclip className="h-4 w-4" />
          <span>Attachments ({attachments.length})</span>
        </div>
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Uploading...' : 'Add File'}
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
        />
      </div>

      {/* Attachments Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
          >
            {/* Preview */}
            <div className="relative">
              {getFilePreview(attachment)}
              
              {/* Delete button */}
              <button
                onClick={() => handleDelete(attachment.id, attachment.originalName)}
                className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* File info */}
            <div className="p-2 space-y-1">
              <div className="flex items-start gap-1">
                {getFileIcon(attachment.mimeType)}
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                  {attachment.originalName}
                </p>
              </div>
              
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{formatFileSize(attachment.size)}</span>
                <span>{format(new Date(attachment.createdAt), 'MMM d')}</span>
              </div>

              {/* Download button */}
              <a
                href={resolveUrl(attachment.url)}
                download={attachment.originalName}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 w-full mt-2 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Download className="h-3 w-3" />
                Download
              </a>
            </div>
          </div>
        ))}
      </div>

      {attachments.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No attachments yet</p>
          <p className="text-xs mt-1">Upload files up to 10MB</p>
        </div>
      )}
    </div>
  );
}
