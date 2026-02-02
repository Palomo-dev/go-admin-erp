'use client';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utils/Utils';
import {
  Copy,
  ExternalLink,
  Clock,
  User,
  MapPin,
  Link2,
  FileJson,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineEvent } from '@/lib/services/timelineService';
import {
  SOURCE_CATEGORY_LABELS,
  SOURCE_TABLE_LABELS,
  SOURCE_TABLE_COLORS,
  ACTION_LABELS,
} from '@/lib/services/timelineService';

interface TimelineEventDetailProps {
  event: TimelineEvent | null;
  open: boolean;
  onClose: () => void;
  actorName?: string;
  onViewCorrelation?: (correlationId: string) => void;
  onNavigateToEntity?: (entityType: string, entityId: string) => void;
}

export function TimelineEventDetail({
  event,
  open,
  onClose,
  actorName,
  onViewCorrelation,
  onNavigateToEntity,
}: TimelineEventDetailProps) {
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!event) return null;

  const eventTime = new Date(event.event_time);
  const createdAt = new Date(event.created_at);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                Detalle del Evento
              </SheetTitle>
              <SheetDescription className="text-sm text-gray-500 dark:text-gray-400">
                {format(eventTime, "EEEE, d 'de' MMMM 'de' yyyy, HH:mm:ss", { locale: es })}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] pr-4">
          <div className="space-y-6">
            {/* Badges de categoría y acción */}
            <div className="flex flex-wrap gap-2">
              <Badge 
                variant="secondary" 
                className={cn('text-xs font-medium', SOURCE_TABLE_COLORS[event.source_table])}
              >
                {SOURCE_TABLE_LABELS[event.source_table] || event.source_table}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {SOURCE_CATEGORY_LABELS[event.source_category] || event.source_category}
              </Badge>
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {ACTION_LABELS[event.action] || event.action}
              </Badge>
            </div>

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Información principal */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Información del Evento
              </h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Tipo de Evento</span>
                  <p className="font-medium text-gray-900 dark:text-white">{event.event_type}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Acción</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {ACTION_LABELS[event.action] || event.action}
                  </p>
                </div>
              </div>

              {/* Event ID */}
              <div className="space-y-1">
                <span className="text-sm text-gray-500 dark:text-gray-400">Event ID</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded text-gray-700 dark:text-gray-300 break-all">
                    {event.event_id}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(event.event_id, 'Event ID')}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Entidad */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Entidad Afectada
              </h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Tipo</span>
                  <p className="font-medium text-gray-900 dark:text-white">{event.entity_type}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Sucursal</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {event.branch_id ? `#${event.branch_id}` : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-sm text-gray-500 dark:text-gray-400">Entity ID</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded text-gray-700 dark:text-gray-300 break-all">
                    {event.entity_id}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(event.entity_id, 'Entity ID')}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {onNavigateToEntity && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigateToEntity(event.entity_type, event.entity_id)}
                      className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Actor */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <User className="h-4 w-4" />
                Actor
              </h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Usuario</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {actorName || (event.actor_id ? 'Usuario' : 'Sistema')}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">IP</span>
                  <p className="font-mono text-gray-900 dark:text-white">
                    {event.ip_address || 'N/A'}
                  </p>
                </div>
              </div>

              {event.actor_id && (
                <div className="space-y-1">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Actor ID</span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded text-gray-700 dark:text-gray-300 break-all">
                      {event.actor_id}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(event.actor_id!, 'Actor ID')}
                      className="h-8 w-8 p-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Correlation ID */}
            {event.correlation_id && (
              <>
                <Separator className="bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Correlación
                  </h3>

                  <div className="space-y-1">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Correlation ID</span>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded text-gray-700 dark:text-gray-300 break-all">
                        {event.correlation_id}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(event.correlation_id!, 'Correlation ID')}
                        className="h-8 w-8 p-0"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewCorrelation?.(event.correlation_id!)}
                    className="w-full border-cyan-300 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-900/20"
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Ver eventos relacionados
                  </Button>
                </div>
              </>
            )}

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Payload */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <FileJson className="h-4 w-4" />
                Payload (Datos del Evento)
              </h3>

              <div className="relative">
                <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto max-h-64 text-gray-700 dark:text-gray-300">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(JSON.stringify(event.payload, null, 2), 'Payload')}
                  className="absolute top-2 right-2 h-7 w-7 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Metadata */}
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <>
                <Separator className="bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Metadata
                  </h3>

                  <div className="relative">
                    <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto max-h-48 text-gray-700 dark:text-gray-300">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            )}

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Timestamps */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Timestamps
              </h3>

              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Fecha del Evento</span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {format(eventTime, "yyyy-MM-dd HH:mm:ss.SSS")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Fecha de Creación</span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {format(createdAt, "yyyy-MM-dd HH:mm:ss.SSS")}
                  </span>
                </div>
              </div>
            </div>

            {/* Información técnica */}
            <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <strong>Tabla fuente:</strong> {event.source_table}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <strong>Categoría:</strong> {event.source_category}
              </p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
