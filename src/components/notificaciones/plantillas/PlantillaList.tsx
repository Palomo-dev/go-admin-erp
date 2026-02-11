'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText, ChevronLeft, ChevronRight, Copy, Trash2, Edit, Send,
  Mail, MessageSquare, Bell, Smartphone, Webhook, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { NotificationTemplate, TemplateChannel } from './types';

interface PlantillaListProps {
  templates: NotificationTemplate[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isAdmin: boolean;
  onPageChange: (page: number) => void;
  onEdit: (t: NotificationTemplate) => void;
  onDuplicate: (t: NotificationTemplate) => void;
  onDelete: (t: NotificationTemplate) => void;
  onTest: (t: NotificationTemplate) => void;
}

const channelConfig: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  app: { icon: Bell, label: 'In-App', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  email: { icon: Mail, label: 'Email', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  sms: { icon: Smartphone, label: 'SMS', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  push: { icon: Bell, label: 'Push', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  webhook: { icon: Webhook, label: 'Webhook', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

export function PlantillaList({
  templates, total, page, pageSize, isLoading, isAdmin,
  onPageChange, onEdit, onDuplicate, onDelete, onTest,
}: PlantillaListProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <FileText className="h-12 w-12 mb-3" />
        <p className="text-base font-medium">No hay plantillas</p>
        <p className="text-sm">Crea tu primera plantilla o ajusta los filtros</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {templates.map((t) => {
          const ch = channelConfig[t.channel] || channelConfig.app;
          const ChIcon = ch.icon;

          return (
            <div
              key={t.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className={cn('flex-shrink-0 p-2 rounded-lg', ch.color)}>
                  <ChIcon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {t.name}
                    </span>
                    <Badge className={cn('text-[10px] px-1.5 py-0', ch.color)}>{ch.label}</Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      v{t.version}
                    </Badge>
                  </div>

                  {t.subject && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 truncate">
                      Asunto: {t.subject}
                    </p>
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {t.body_text.substring(0, 120)}{t.body_text.length > 120 ? '...' : ''}
                  </p>

                  <div className="flex items-center gap-3 mt-2">
                    {t.variables && t.variables.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        Variables: {t.variables.map((v) => `{{${v}}}`).join(', ')}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {new Date(t.updated_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTest(t)}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-blue-500"
                    title="Probar envío"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(t)}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-blue-500"
                    title="Editar"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDuplicate(t)}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-amber-500"
                        title="Duplicar"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(t)}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)} className="h-7 w-7 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <span key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-xs text-gray-400 px-1">…</span>}
                  <Button
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(p)}
                    className="h-7 w-7 p-0 text-xs"
                  >
                    {p}
                  </Button>
                </span>
              ))}
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} className="h-7 w-7 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
