'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/Utils';
import {
  FileJson,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  MoreVertical,
  Download,
  Copy,
  Trash2,
  RefreshCw,
  Edit,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineExport } from '@/lib/services/timelineExportsService';

interface ExportCardProps {
  exportItem: TimelineExport;
  onDuplicate: (id: string) => void;
  onRerun: (id: string) => void;
  onEdit: (exportItem: TimelineExport) => void;
  onDelete: (id: string) => void;
}

export function ExportCard({
  exportItem,
  onDuplicate,
  onRerun,
  onEdit,
  onDelete,
}: ExportCardProps) {
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle2,
          label: 'Completada',
          color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        };
      case 'processing':
        return {
          icon: Loader2,
          label: 'Procesando',
          color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
          animate: true,
        };
      case 'failed':
        return {
          icon: XCircle,
          label: 'Fallida',
          color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        };
      default:
        return {
          icon: Clock,
          label: 'Pendiente',
          color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
        };
    }
  };

  const getFormatIcon = (format: string) => {
    return format === 'csv' ? FileSpreadsheet : FileJson;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusInfo = getStatusInfo(exportItem.status);
  const FormatIcon = getFormatIcon(exportItem.format);
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Icono y contenido */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn(
              'p-2 rounded-lg',
              exportItem.format === 'csv' 
                ? 'bg-green-100 dark:bg-green-900/30' 
                : 'bg-blue-100 dark:bg-blue-900/30'
            )}>
              <FormatIcon className={cn(
                'h-5 w-5',
                exportItem.format === 'csv'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-blue-600 dark:text-blue-400'
              )} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-gray-900 dark:text-white truncate">
                  {exportItem.name}
                </h3>
                <Badge variant="secondary" className={cn('text-xs', statusInfo.color)}>
                  <StatusIcon className={cn('h-3 w-3 mr-1', statusInfo.animate && 'animate-spin')} />
                  {statusInfo.label}
                </Badge>
              </div>

              {exportItem.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate mb-2">
                  {exportItem.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(exportItem.created_at), { addSuffix: true, locale: es })}
                </span>

                {exportItem.record_count !== undefined && (
                  <span>{exportItem.record_count.toLocaleString('es-CO')} registros</span>
                )}

                {exportItem.file_size && (
                  <span>{formatFileSize(exportItem.file_size)}</span>
                )}

                <Badge variant="outline" className="text-xs uppercase">
                  {exportItem.format}
                </Badge>
              </div>

              {exportItem.error_message && (
                <p className="text-xs text-red-500 mt-2 truncate">
                  Error: {exportItem.error_message}
                </p>
              )}
            </div>
          </div>

          {/* Acciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {exportItem.status === 'completed' && (
                <DropdownMenuItem onClick={() => onRerun(exportItem.id)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar de nuevo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onDuplicate(exportItem.id)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar exportación
              </DropdownMenuItem>
              {exportItem.status === 'failed' && (
                <DropdownMenuItem onClick={() => onRerun(exportItem.id)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reintentar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onEdit(exportItem)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar nombre
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDelete(exportItem.id)}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
