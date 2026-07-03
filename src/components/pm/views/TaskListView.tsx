'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Clock,
  Calendar,
  FolderKanban,
  User,
  AlertTriangle,
  ClipboardList,
  Target,
  Flag,
  Bot,
  Tag,
} from 'lucide-react';
import { type PMTask, PRIORITY_COLORS, PRIORITY_LABELS, TASK_STATUS_COLORS, TASK_STATUS_LABELS, TASK_TYPE_LABELS } from '@/lib/services/pmService';
import { pmService } from '@/lib/services/pmService';
import { useToast } from '@/components/ui/use-toast';

interface TaskListViewProps {
  tasks: PMTask[];
  onTaskClick?: (task: PMTask) => void;
  onTaskUpdate: () => void;
}

function getAssigneeName(task: PMTask): string {
  if (!task.profiles) return '';
  const p = task.profiles;
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || '';
}

function isOverdue(task: PMTask): boolean {
  return !!(task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'canceled');
}

function isAgentTask(task: PMTask): boolean {
  return (task.related_to_type || '').startsWith('agent:') || (task.tags || []).includes('agente');
}

export function TaskListView({ tasks, onTaskClick, onTaskUpdate }: TaskListViewProps) {
  const { toast } = useToast();

  const handleToggleDone = async (task: PMTask, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = task.status === 'done' ? 'open' : 'done';
    try {
      await pmService.updateTaskStatus(task.id, newStatus);
      onTaskUpdate();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <ClipboardList className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay tareas</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Crea tareas manualmente o usa el Planificador IA</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const overdue = isOverdue(task);
        const assignee = getAssigneeName(task);
        const agentTask = isAgentTask(task);
        const visibleTags = (task.tags || []).filter(t => t !== 'agente' && t !== 'onboarding').slice(0, 3);

        return (
          <Card
            key={task.id}
            className={`hover:shadow-sm transition-all cursor-pointer ${
              overdue ? 'border-red-200 dark:border-red-800' : ''
            } ${task.status === 'done' ? 'opacity-70' : ''}`}
            onClick={() => onTaskClick?.(task)}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                {/* Checkbox completar */}
                <div className="mt-0.5" onClick={(e) => handleToggleDone(task, e)}>
                  <Checkbox checked={task.status === 'done'} className="cursor-pointer" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`text-sm font-medium text-gray-900 dark:text-white ${task.status === 'done' ? 'line-through' : ''}`}>
                      {task.title}
                    </h4>
                    <Badge className={`text-[10px] ${TASK_STATUS_COLORS[task.status]}`}>
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>
                    <Badge className={`text-[10px] ${PRIORITY_COLORS[task.priority]}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                    {task.type && TASK_TYPE_LABELS[task.type] && (
                      <Badge className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        {TASK_TYPE_LABELS[task.type]}
                      </Badge>
                    )}
                    {agentTask && (
                      <Badge className="text-[10px] bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                        <Bot className="h-2.5 w-2.5 mr-0.5" />Agente
                      </Badge>
                    )}
                    {overdue && (
                      <Badge className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Vencida
                      </Badge>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{task.description}</p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    {task.projects?.name && (
                      <span className="flex items-center gap-1">
                        <FolderKanban className="h-3 w-3" />{task.projects.name}
                      </span>
                    )}
                    {task.due_date && (
                      <span className={`flex items-center gap-1 ${overdue ? 'text-red-500' : ''}`}>
                        <Calendar className="h-3 w-3" />
                        {new Date(task.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {task.estimated_hours && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {task.actual_hours || 0}/{task.estimated_hours}h
                      </span>
                    )}
                    {assignee && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />{assignee}
                      </span>
                    )}
                    {task.goals?.title && (
                      <span className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400">
                        <Target className="h-3 w-3" />{task.goals.title}
                      </span>
                    )}
                    {task.milestones?.title && (
                      <span className="flex items-center gap-1">
                        <Flag className="h-3 w-3" />{task.milestones.title}
                      </span>
                    )}
                    {visibleTags.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />{visibleTags.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
