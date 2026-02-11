'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MoreVertical, Play, Pencil, Copy, Trash2, Power, PowerOff,
  Clock, CalendarClock, Mail, FileText,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  ScheduledReport, FREQUENCY_LABEL,
} from './scheduledReportService';

interface ScheduledListProps {
  data: ScheduledReport[];
  isLoading: boolean;
  onEdit: (item: ScheduledReport) => void;
  onDuplicate: (item: ScheduledReport) => void;
  onDelete: (item: ScheduledReport) => void;
  onToggleActive: (item: ScheduledReport) => void;
  onExecuteNow: (item: ScheduledReport) => void;
  onViewHistory: (item: ScheduledReport) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant="outline" className={cn(
      'text-xs font-medium',
      isActive
        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
        : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
    )}>
      {isActive ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}

function ExecutionBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-xs text-gray-400">Sin ejecuciones</span>;
  const colors: Record<string, string> = {
    completed: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
    running: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
    failed: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  };
  const labels: Record<string, string> = { completed: 'Completado', running: 'Ejecutando', failed: 'Error' };
  return (
    <Badge variant="outline" className={cn('text-xs', colors[status] || colors.completed)}>
      {labels[status] || status}
    </Badge>
  );
}

export function ScheduledList({
  data, isLoading,
  onEdit, onDuplicate, onDelete, onToggleActive, onExecuteNow, onViewHistory,
}: ScheduledListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <CalendarClock className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No hay reportes programados</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Crea uno nuevo para enviar reportes automáticos</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div
          key={item.id}
          className={cn(
            'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4',
            'hover:border-blue-200 dark:hover:border-blue-800 transition-colors',
            !item.is_active && 'opacity-60'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            {/* Info principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</h3>
                <StatusBadge isActive={item.is_active} />
              </div>

              {/* Detalles */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                {item.saved_report_name && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {item.saved_report_name}
                    {item.saved_report_module && (
                      <Badge variant="outline" className="text-[10px] ml-1 px-1.5 py-0 border-gray-200 dark:border-gray-700">
                        {item.saved_report_module}
                      </Badge>
                    )}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {FREQUENCY_LABEL[item.frequency] || item.frequency}
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {item.recipients.length} destinatario{item.recipients.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Ejecuciones */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400 dark:text-gray-500">
                <span>
                  Próxima: <strong className="text-gray-600 dark:text-gray-300">{formatDate(item.next_run_at)}</strong>
                </span>
                {item.last_execution && (
                  <span className="flex items-center gap-1">
                    Última: {formatDate(item.last_execution.created_at)}
                    <ExecutionBadge status={item.last_execution.status} />
                  </span>
                )}
                {!item.last_execution && (
                  <span>Última: <em>nunca ejecutado</em></span>
                )}
              </div>
            </div>

            {/* Acciones */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                <DropdownMenuItem onClick={() => onExecuteNow(item)} className="gap-2">
                  <Play className="h-4 w-4" /> Ejecutar ahora
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewHistory(item)} className="gap-2">
                  <Clock className="h-4 w-4" /> Ver historial
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(item)} className="gap-2">
                  <Pencil className="h-4 w-4" /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(item)} className="gap-2">
                  <Copy className="h-4 w-4" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleActive(item)} className="gap-2">
                  {item.is_active
                    ? <><PowerOff className="h-4 w-4" /> Desactivar</>
                    : <><Power className="h-4 w-4" /> Activar</>
                  }
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(item)} className="gap-2 text-red-600 dark:text-red-400">
                  <Trash2 className="h-4 w-4" /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
