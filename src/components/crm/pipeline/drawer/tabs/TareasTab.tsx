'use client';

import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import type { OpportunityTask } from '@/components/crm/oportunidades/types';
import { TasksSection } from '../TasksSection';
import type { DrawerTabProps } from './types';

/** Pestaña Tareas: carga perezosa + TasksSection existente (refetch solo de tareas). */
export function TareasTab({ opportunity, active, onCountChange }: DrawerTabProps & { onCountChange?: (n: number) => void }) {
  const [tasks, setTasks] = useState<OpportunityTask[] | null>(null);

  const load = useCallback(async () => {
    const list = await opportunitiesService.getOpportunityTasks(opportunity.id);
    setTasks(list);
    onCountChange?.(list.filter((t) => t.status !== 'done' && t.status !== 'canceled').length);
  }, [opportunity.id, onCountChange]);

  useEffect(() => {
    if (active && tasks === null) void load();
  }, [active, tasks, load]);

  if (!active) return null;
  if (tasks === null) return <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-16 w-full" /></div>;

  return (
    <TasksSection
      opportunityId={opportunity.id}
      customerId={opportunity.customer_id ?? undefined}
      tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, description: t.description, assigned_to: t.assigned_to }))}
      onTasksChanged={() => void load()}
    />
  );
}
