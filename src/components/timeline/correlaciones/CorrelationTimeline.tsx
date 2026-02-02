'use client';

import React, { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { CorrelationStepCard } from './CorrelationStepCard';
import type { TimelineEvent } from '@/lib/services/timelineService';
import timelineService from '@/lib/services/timelineService';

interface CorrelationTimelineProps {
  events: TimelineEvent[];
  loading: boolean;
  onViewDetail: (event: TimelineEvent) => void;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
}

export function CorrelationTimeline({
  events,
  loading,
  onViewDetail,
  onNavigateToEntity,
}: CorrelationTimelineProps) {
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

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <Skeleton className="w-10 h-10 rounded-full" />
              {i < 3 && <Skeleton className="w-0.5 flex-1 min-h-[60px]" />}
            </div>
            <Skeleton className="flex-1 h-32 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p>No hay eventos en esta correlación</p>
      </div>
    );
  }

  // Ordenar eventos por tiempo
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  );

  return (
    <div className="relative">
      {/* Timeline */}
      <div className="space-y-0">
        {sortedEvents.map((event, idx) => (
          <CorrelationStepCard
            key={event.event_id}
            event={event}
            stepNumber={idx + 1}
            totalSteps={sortedEvents.length}
            actorName={event.actor_id ? actorNames[event.actor_id] : undefined}
            isFirst={idx === 0}
            isLast={idx === sortedEvents.length - 1}
            onViewDetail={onViewDetail}
            onNavigateToEntity={onNavigateToEntity}
          />
        ))}
      </div>
    </div>
  );
}
