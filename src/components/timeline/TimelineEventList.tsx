'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { TimelineEventCard } from './TimelineEventCard';
import type { TimelineEvent } from '@/lib/services/timelineService';
import timelineService from '@/lib/services/timelineService';

interface TimelineEventListProps {
  events: TimelineEvent[];
  loading: boolean;
  hasMore: boolean;
  totalCount: number;
  onLoadMore: () => void;
  onViewDetail: (event: TimelineEvent) => void;
  onViewCorrelation: (correlationId: string) => void;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
  error?: string | null;
  onRetry?: () => void;
}

export function TimelineEventList({
  events,
  loading,
  hasMore,
  totalCount,
  onLoadMore,
  onViewDetail,
  onViewCorrelation,
  onNavigateToEntity,
  error,
  onRetry,
}: TimelineEventListProps) {
  const [actorNames, setActorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const resolveNames = async () => {
      const actorIds = events
        .map((e) => e.actor_id)
        .filter((id): id is string => id !== null && !actorNames[id]);

      if (actorIds.length > 0) {
        const uniqueIds = [...new Set(actorIds)];
        const names = await timelineService.resolveActorNames(uniqueIds);
        setActorNames((prev) => ({ ...prev, ...names }));
      }
    };

    resolveNames();
  }, [events]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Error al cargar eventos
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {error}
        </p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (loading && events.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex gap-4">
              <Skeleton className="w-3 h-3 rounded-full" />
              <div className="flex-1 space-y-3">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-gray-400" />
        </div>
        <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No hay eventos
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No se encontraron eventos con los filtros seleccionados.
          <br />
          Intenta ajustar el rango de fechas o los filtros.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Contador */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>
          Mostrando {events.length.toLocaleString('es-CO')} de {totalCount.toLocaleString('es-CO')} eventos
        </span>
      </div>

      {/* Lista de eventos */}
      <div className="space-y-2">
        {events.map((event) => (
          <TimelineEventCard
            key={event.event_id}
            event={event}
            actorName={event.actor_id ? actorNames[event.actor_id] : undefined}
            onViewDetail={onViewDetail}
            onViewCorrelation={onViewCorrelation}
            onNavigateToEntity={onNavigateToEntity}
          />
        ))}
      </div>

      {/* Cargar más */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={onLoadMore}
            disabled={loading}
            variant="outline"
            className="border-gray-300 dark:border-gray-600"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cargando...
              </>
            ) : (
              'Cargar más eventos'
            )}
          </Button>
        </div>
      )}

      {/* Loading indicator para paginación */}
      {loading && events.length > 0 && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      )}
    </div>
  );
}
