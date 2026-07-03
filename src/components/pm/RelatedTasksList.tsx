'use client';

import React from 'react';
import { Clock, User, Calendar, CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type PMTask, TASK_STATUS_LABELS, TASK_STATUS_COLORS } from '@/lib/services/pmService';

interface RelatedTasksListProps {
  tasks: PMTask[];
  loading?: boolean;
  emptyLabel?: string;
  /** Mostrar el proyecto (para el drawer de meta) o la meta (para el drawer de proyecto) */
  show?: 'project' | 'goal' | 'none';
  onOpenTask?: (task: PMTask) => void;
}

function assigneeName(task: PMTask): string {
  if (!task.profiles) return '';
  const p = task.profiles;
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || '';
}

function isDone(status: string): boolean {
  return status === 'done';
}

function isOverdue(task: PMTask): boolean {
  return !!(task.due_date && new Date(task.due_date) < new Date() && !isDone(task.status) && task.status !== 'canceled');
}

export function RelatedTasksList({ tasks, loading, emptyLabel = 'Sin tareas vinculadas', show = 'none', onOpenTask }: RelatedTasksListProps) {
  const total = tasks.length;
  const done = tasks.filter(t => isDone(t.status)).length;
  const estTotal = tasks.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
  const actualTotal = tasks.reduce((s, t) => s + (Number(t.actual_hours) || 0), 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) {
    return <p className="text-xs text-gray-400">Cargando tareas...</p>;
  }

  if (total === 0) {
    return <p className="text-xs text-gray-400">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {/* Resumen */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{done}/{total} completadas</span>
        {estTotal > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{actualTotal}/{estTotal}h</span>}
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : 'bg-yellow-400'}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Lista */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {tasks.map(task => {
          const name = assigneeName(task);
          const related = show === 'project' ? task.projects?.name : show === 'goal' ? task.goals?.title : '';
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask?.(task)}
              className="w-full text-left flex items-start gap-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              {isDone(task.status)
                ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                : <Circle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isDone(task.status) ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 flex-wrap mt-1 text-[10px] text-gray-500">
                  <Badge className={`text-[9px] px-1.5 py-0 ${TASK_STATUS_COLORS[task.status] || ''}`}>
                    {TASK_STATUS_LABELS[task.status] || task.status}
                  </Badge>
                  {task.estimated_hours != null && (
                    <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{task.actual_hours || 0}/{task.estimated_hours}h</span>
                  )}
                  {task.due_date && (
                    <span className={`flex items-center gap-0.5 ${isOverdue(task) ? 'text-red-500 font-medium' : ''}`}>
                      <Calendar className="h-3 w-3" />
                      {new Date(task.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  {name && <span className="flex items-center gap-0.5"><User className="h-3 w-3" />{name}</span>}
                  {related && <span className="text-blue-500 truncate max-w-[120px]">{related}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
