'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import {
  User,
  Clock,
  Link2,
  ExternalLink,
  Copy,
  ChevronRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineEvent } from '@/lib/services/timelineService';
import {
  SOURCE_CATEGORY_LABELS,
  SOURCE_TABLE_LABELS,
  SOURCE_TABLE_COLORS,
  ACTION_LABELS,
} from '@/lib/services/timelineService';

interface TimelineEventCardProps {
  event: TimelineEvent;
  actorName?: string;
  onViewDetail?: (event: TimelineEvent) => void;
  onViewCorrelation?: (correlationId: string) => void;
  onNavigateToEntity?: (entityType: string, entityId: string) => void;
}

export function TimelineEventCard({
  event,
  actorName,
  onViewDetail,
  onViewCorrelation,
  onNavigateToEntity,
}: TimelineEventCardProps) {
  const handleCopyId = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getActionColor = (action: string) => {
    const actionColors: Record<string, string> = {
      create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      approve: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      reject: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
      void: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      assign: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      transfer: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    };
    return actionColors[action] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  const eventTime = new Date(event.event_time);
  const formattedTime = format(eventTime, "dd MMM yyyy, HH:mm:ss", { locale: es });
  const relativeTime = formatDistanceToNow(eventTime, { addSuffix: true, locale: es });

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-all duration-200 group">
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Timeline indicator */}
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-3 h-3 rounded-full',
              event.source_category === 'audit' ? 'bg-blue-500' :
              event.source_category === 'domain_event' ? 'bg-green-500' : 'bg-purple-500'
            )} />
            <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 mt-2" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Módulo badge */}
                <Badge 
                  variant="secondary" 
                  className={cn('text-xs font-medium', SOURCE_TABLE_COLORS[event.source_table])}
                >
                  {SOURCE_TABLE_LABELS[event.source_table] || event.source_table}
                </Badge>

                {/* Acción badge */}
                <Badge 
                  variant="secondary" 
                  className={cn('text-xs font-medium', getActionColor(event.action))}
                >
                  {ACTION_LABELS[event.action] || event.action}
                </Badge>

                {/* Correlation badge */}
                {event.correlation_id && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className="text-xs cursor-pointer hover:bg-cyan-50 dark:hover:bg-cyan-900/20"
                          onClick={() => onViewCorrelation?.(event.correlation_id!)}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          Correlación
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Ver eventos relacionados</p>
                        <p className="text-xs text-gray-400 font-mono">{event.correlation_id}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {/* Timestamp */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      <Clock className="h-3 w-3 mr-1" />
                      {relativeTime}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{formattedTime}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Main content */}
            <div className="mb-2">
              <p className="text-sm text-gray-900 dark:text-white">
                <span className="font-medium">{event.event_type}</span>
                {' '}en{' '}
                <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">
                  {event.entity_type}
                </span>
              </p>
              
              {/* Entity ID */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ID: 
                </span>
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">
                  {event.entity_id.length > 20 
                    ? `${event.entity_id.substring(0, 20)}...` 
                    : event.entity_id}
                </code>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={() => handleCopyId(event.entity_id)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Copiar ID</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {onNavigateToEntity && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button 
                          onClick={() => onNavigateToEntity(event.entity_type, event.entity_id)}
                          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Ir a la entidad</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {/* Actor */}
                {(event.actor_id || actorName) && (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{actorName || event.actor_id?.substring(0, 8) || 'Sistema'}</span>
                  </div>
                )}

                {/* IP */}
                {event.ip_address && (
                  <span className="font-mono">{event.ip_address}</span>
                )}

                {/* Branch */}
                {event.branch_id && (
                  <span>Sucursal #{event.branch_id}</span>
                )}
              </div>

              {/* Ver detalle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewDetail?.(event)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7"
              >
                Ver detalle
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
