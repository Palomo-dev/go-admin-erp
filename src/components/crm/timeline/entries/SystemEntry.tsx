'use client';

import { ArrowRight } from 'lucide-react';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';

/** SystemEntry — "Etapa: A → B" con colores de etapa, o el texto de la activity system. */
type SystemLike = Extract<TimelineEntry, { kind: 'system' }>;

function StagePill({ stage }: { stage: { name: string; color: string | null } | null }) {
  if (!stage) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-[11px] text-gray-700 dark:text-gray-200">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color ?? '#3b82f6' }} aria-hidden />
      {stage.name}
    </span>
  );
}

export function SystemEntry({ entry }: { entry: SystemLike }) {
  const isStageChange = Boolean(entry.from_stage || entry.to_stage);
  return (
    <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2 flex-wrap">
      {isStageChange ? (
        <>
          <span>Etapa:</span>
          <StagePill stage={entry.from_stage} />
          <ArrowRight className="h-3 w-3" />
          <StagePill stage={entry.to_stage} />
        </>
      ) : (
        <span className="whitespace-pre-wrap">{entry.activity?.notes ?? 'Evento del sistema'}</span>
      )}
    </div>
  );
}
