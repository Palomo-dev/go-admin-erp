'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { onboardingService } from '@/lib/services/crm/onboardingService';
import type { OnboardingTask } from '@/lib/services/crm/onboardingService';
import {
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  ClipboardList,
} from 'lucide-react';

interface OnboardingChecklistProps {
  opportunityId: string;
}

export function OnboardingChecklist({ opportunityId }: OnboardingChecklistProps) {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    setLoading(true);
    try {
      const data = await onboardingService.getOnboardingChecklist(opportunityId);
      setTasks(data);
    } catch (err) {
      console.error('Error cargando checklist de onboarding:', err);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el checklist de onboarding',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const handleToggleTask = async (task: OnboardingTask) => {
    setTogglingId(task.id);
    try {
      const isCompleted = task.status === 'completed' || task.status === 'done';
      const newStatus = isCompleted ? 'pending' : 'completed';
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          completed_at: isCompleted ? null : new Date().toISOString(),
          completed_by: isCompleted ? null : userData.user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) throw error;

      await loadChecklist();
    } catch (err) {
      console.error('Error toggling task:', err);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la tarea',
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const completedCount = tasks.filter(
    (t) => t.status === 'completed' || t.status === 'done'
  ).length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
    });
  };

  return (
    <Card className="p-4 sm:p-5 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Checklist de Onboarding
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadChecklist}
          disabled={loading}
          className="h-7 px-2"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Progreso */}
      {totalCount > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {completedCount} de {totalCount} completadas
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {progressPct}%
            </Badge>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Lista de tareas */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Circle className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No hay tareas de onboarding para esta oportunidad
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => {
            const isCompleted = task.status === 'completed' || task.status === 'done';
            return (
              <div
                key={task.id}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
                  isCompleted
                    ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/50'
                    : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => handleToggleTask(task)}
                  disabled={togglingId === task.id}
                  className="mt-0.5 shrink-0"
                >
                  {togglingId === task.id ? (
                    <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-400 hover:text-blue-500 transition-colors" />
                  )}
                </button>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium ${
                        isCompleted
                          ? 'text-green-700 dark:text-green-400 line-through'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {formatDate(task.due_date)}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {task.description}
                    </p>
                  )}
                  {task.assigned_to_name && (
                    <span className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5 inline-block">
                      {task.assigned_to_name}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default OnboardingChecklist;
