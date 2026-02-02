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
  ChevronRight,
  Clock,
  User,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineEvent } from '@/lib/services/timelineService';
import {
  SOURCE_TABLE_LABELS,
  SOURCE_TABLE_COLORS,
  ACTION_LABELS,
} from '@/lib/services/timelineService';

interface CorrelationStepCardProps {
  event: TimelineEvent;
  stepNumber: number;
  totalSteps: number;
  actorName?: string;
  isFirst?: boolean;
  isLast?: boolean;
  onViewDetail: (event: TimelineEvent) => void;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
}

export function CorrelationStepCard({
  event,
  stepNumber,
  totalSteps,
  actorName,
  isFirst,
  isLast,
  onViewDetail,
  onNavigateToEntity,
}: CorrelationStepCardProps) {
  const eventTime = new Date(event.event_time);

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      create: 'bg-green-500',
      update: 'bg-blue-500',
      delete: 'bg-red-500',
      approve: 'bg-emerald-500',
      reject: 'bg-rose-500',
      status_change: 'bg-purple-500',
      void: 'bg-gray-500',
    };
    return colors[action] || 'bg-gray-500';
  };

  const getStepColor = () => {
    if (isFirst) return 'bg-green-500 ring-green-200 dark:ring-green-800';
    if (isLast) return 'bg-blue-500 ring-blue-200 dark:ring-blue-800';
    return 'bg-cyan-500 ring-cyan-200 dark:ring-cyan-800';
  };

  return (
    <div className="relative flex gap-4">
      {/* Línea de conexión vertical */}
      <div className="flex flex-col items-center">
        {/* Indicador de paso */}
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ring-4 z-10',
          getStepColor()
        )}>
          {stepNumber}
        </div>
        
        {/* Línea conectora */}
        {!isLast && (
          <div className="w-0.5 flex-1 bg-gradient-to-b from-cyan-300 to-cyan-500 dark:from-cyan-700 dark:to-cyan-500 min-h-[40px]" />
        )}
      </div>

      {/* Card del evento */}
      <Card className={cn(
        'flex-1 mb-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        'hover:shadow-md transition-shadow cursor-pointer group'
      )}
      onClick={() => onViewDetail(event)}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Módulo */}
              <Badge 
                variant="secondary" 
                className={cn('text-xs font-medium', SOURCE_TABLE_COLORS[event.source_table])}
              >
                {SOURCE_TABLE_LABELS[event.source_table] || event.source_table}
              </Badge>
              
              {/* Acción */}
              <Badge 
                variant="outline" 
                className="text-xs border-gray-300 dark:border-gray-600"
              >
                <span className={cn('w-2 h-2 rounded-full mr-1.5', getActionColor(event.action))} />
                {ACTION_LABELS[event.action] || event.action}
              </Badge>

              {/* Indicadores */}
              {isFirst && (
                <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Inicio
                </Badge>
              )}
              {isLast && (
                <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  Fin
                </Badge>
              )}
            </div>

            {/* Timestamp */}
            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              <Clock className="h-3 w-3 mr-1" />
              {format(eventTime, "HH:mm:ss.SSS", { locale: es })}
            </div>
          </div>

          {/* Contenido */}
          <div className="mb-3">
            <p className="font-medium text-gray-900 dark:text-white">
              {event.event_type}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Entidad: 
              <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded ml-1.5">
                {event.entity_type}
              </span>
              <span className="mx-1">→</span>
              <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {event.entity_id.length > 20 ? `${event.entity_id.substring(0, 20)}...` : event.entity_id}
              </span>
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              {/* Actor */}
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{actorName || (event.actor_id ? 'Usuario' : 'Sistema')}</span>
              </div>

              {/* Fecha */}
              <span>{format(eventTime, "dd/MM/yyyy", { locale: es })}</span>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToEntity(event.entity_type, event.entity_id);
                      }}
                      className="h-7 px-2 text-blue-600 dark:text-blue-400"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Ver entidad
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Ir a {event.entity_type}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
