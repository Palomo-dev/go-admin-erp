'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, PlusCircle, RefreshCcw, XCircle, Trash2 } from 'lucide-react';
import { SessionAuditService, type SessionAuditEvent } from './sessionAuditService';

interface SessionTimelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
}

function actionIcon(action: SessionAuditEvent['action']) {
  switch (action) {
    case 'INSERT':
      return <PlusCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case 'DELETE':
      return <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />;
    default:
      return <RefreshCcw className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionTimelineDialog({ open, onOpenChange, tableId }: SessionTimelineDialogProps) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<SessionAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    SessionAuditService.getTableSessionTimeline(tableId)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch(() => {
        if (active) setError('No se pudo cargar el historial de la mesa.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, tableId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Historial de la Mesa
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
        )}

        {!loading && !error && events.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
            Sin eventos registrados para esta mesa.
          </p>
        )}

        {!loading && !error && events.length > 0 && (
          <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-2 space-y-4 py-2">
            {events.map((event) => (
              <li key={event.id} className="ml-4">
                <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-700">
                  {actionIcon(event.action)}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <time className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDateTime(event.createdAt)}
                  </time>
                  <Badge variant="outline" className="text-[10px]">
                    {event.userName}
                  </Badge>
                </div>
                <div className="mt-1 space-y-0.5">
                  {event.descriptions.map((desc, i) => (
                    <p key={i} className="text-sm text-gray-800 dark:text-gray-200">
                      {desc}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
