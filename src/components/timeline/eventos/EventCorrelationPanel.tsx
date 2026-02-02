'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineEvent } from '@/lib/services/timelineService';
import timelineService, {
  SOURCE_TABLE_LABELS,
  SOURCE_TABLE_COLORS,
  ACTION_LABELS,
} from '@/lib/services/timelineService';

interface EventCorrelationPanelProps {
  event: TimelineEvent;
  organizationId: number;
  onViewEvent: (eventId: string) => void;
  onViewAllCorrelation: (correlationId: string) => void;
}

export function EventCorrelationPanel({
  event,
  organizationId,
  onViewEvent,
  onViewAllCorrelation,
}: EventCorrelationPanelProps) {
  const [correlatedEvents, setCorrelatedEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadCorrelatedEvents = async () => {
      if (!event.correlation_id) return;
      
      setLoading(true);
      try {
        const events = await timelineService.getCorrelatedEvents(
          organizationId,
          event.correlation_id
        );
        setCorrelatedEvents(events);
      } catch (error) {
        console.error('Error loading correlated events:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCorrelatedEvents();
  }, [event.correlation_id, organizationId]);

  const handleCopyCorrelationId = () => {
    if (event.correlation_id) {
      navigator.clipboard.writeText(event.correlation_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!event.correlation_id) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            Correlación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500 dark:text-gray-400 italic p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
            Este evento no tiene correlation_id.
            <br />
            No está vinculado a una operación de múltiples pasos.
          </div>
        </CardContent>
      </Card>
    );
  }

  const otherEvents = correlatedEvents.filter(e => e.event_id !== event.event_id);
  const currentEventIndex = correlatedEvents.findIndex(e => e.event_id === event.event_id);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            Correlación
            {correlatedEvents.length > 1 && (
              <Badge variant="secondary" className="ml-2">
                {correlatedEvents.length} eventos
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewAllCorrelation(event.correlation_id!)}
            className="text-xs"
          >
            Ver todos
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Correlation ID */}
        <div className="flex items-center justify-between p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-cyan-600 dark:text-cyan-400">Correlation ID</p>
            <code className="text-sm font-mono text-cyan-800 dark:text-cyan-300 block truncate">
              {event.correlation_id}
            </code>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCorrelationId}
                  className="h-8 w-8 p-0 flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{copied ? 'Copiado!' : 'Copiar Correlation ID'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Timeline de eventos correlacionados */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : otherEvents.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Otros eventos en esta operación ({otherEvents.length})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {correlatedEvents.map((e, idx) => {
                const isCurrentEvent = e.event_id === event.event_id;
                const eventTime = new Date(e.event_time);
                
                return (
                  <div
                    key={e.event_id}
                    className={cn(
                      'p-3 rounded-lg border transition-colors',
                      isCurrentEvent
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                        : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer'
                    )}
                    onClick={() => !isCurrentEvent && onViewEvent(e.event_id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Número de secuencia */}
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                        isCurrentEvent
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                      )}>
                        {idx + 1}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant="secondary" 
                            className={cn('text-xs', SOURCE_TABLE_COLORS[e.source_table])}
                          >
                            {SOURCE_TABLE_LABELS[e.source_table] || e.source_table}
                          </Badge>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {ACTION_LABELS[e.action] || e.action}
                          </span>
                          {isCurrentEvent && (
                            <Badge className="text-xs bg-blue-500 text-white">
                              Actual
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {e.event_type}
                        </p>
                        
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-1">
                          <Clock className="h-3 w-3" />
                          {format(eventTime, "HH:mm:ss.SSS", { locale: es })}
                        </div>
                      </div>
                      
                      {!isCurrentEvent && (
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
            Este es el único evento con este correlation_id.
          </div>
        )}

        {/* Posición en la secuencia */}
        {correlatedEvents.length > 1 && currentEventIndex >= 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Evento {currentEventIndex + 1} de {correlatedEvents.length} en esta operación
          </div>
        )}
      </CardContent>
    </Card>
  );
}
