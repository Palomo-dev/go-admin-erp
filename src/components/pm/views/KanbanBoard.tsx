'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Clock,
  User,
  FolderKanban,
  Calendar,
  GripVertical,
  AlertTriangle,
  GitBranch,
} from 'lucide-react';
import { pmService, type PMTask, type TaskTimeEntry, PRIORITY_COLORS, PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/services/pmService';
import { TaskTimer } from '@/components/pm/TaskTimer';
import { useToast } from '@/components/ui/use-toast';

interface KanbanBoardProps {
  tasks: PMTask[];
  onTaskUpdate: () => void;
  onTaskClick?: (task: PMTask) => void;
  runningTimers?: Record<string, TaskTimeEntry>;
}

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  borderColor: string;
  headerBg: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'open', title: 'Pendiente', color: 'text-gray-600', borderColor: 'border-t-gray-400', headerBg: 'bg-gray-50 dark:bg-gray-800' },
  { id: 'in_progress', title: 'En Progreso', color: 'text-yellow-600', borderColor: 'border-t-yellow-400', headerBg: 'bg-yellow-50 dark:bg-yellow-900/10' },
  { id: 'done', title: 'Completada', color: 'text-green-600', borderColor: 'border-t-green-400', headerBg: 'bg-green-50 dark:bg-green-900/10' },
  { id: 'canceled', title: 'Cancelada', color: 'text-red-600', borderColor: 'border-t-red-400', headerBg: 'bg-red-50 dark:bg-red-900/10' },
];

function getAssigneeName(task: PMTask): string {
  if (!task.profiles) return '';
  const p = task.profiles;
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || '';
}

function isOverdue(task: PMTask): boolean {
  return !!(task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'canceled');
}

export function KanbanBoard({ tasks, onTaskUpdate, onTaskClick, runningTimers }: KanbanBoardProps) {
  const { toast } = useToast();
  const [updating, setUpdating] = useState<string | null>(null);
  // Copia local para actualización optimista: la tarjeta se mueve al instante sin recargar
  const [localTasks, setLocalTasks] = useState<PMTask[]>(tasks);
  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = localTasks.filter(t => t.status === col.id);
    return acc;
  }, {} as Record<string, PMTask[]>);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;

    const newStatus = destination.droppableId;
    // Actualización optimista inmediata (sin esperar al servidor ni recargar)
    setLocalTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus as PMTask['status'] } : t));
    setUpdating(draggableId);

    try {
      await pmService.updateTaskStatus(draggableId, newStatus);
      toast({
        title: 'Tarea actualizada',
        description: `Movida a "${TASK_STATUS_LABELS[newStatus]}"`,
      });
      onTaskUpdate();
    } catch (error: any) {
      // Revertir el cambio optimista si falla
      setLocalTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: source.droppableId as PMTask['status'] } : t));
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  }, [onTaskUpdate, toast]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-h-[500px]">
        {COLUMNS.map((column) => (
          <div key={column.id} className={`rounded-lg border border-gray-200 dark:border-gray-700 border-t-4 ${column.borderColor} flex flex-col`}>
            {/* Column Header */}
            <div className={`p-3 ${column.headerBg} rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <h3 className={`font-semibold text-sm ${column.color}`}>
                  {column.title}
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {tasksByStatus[column.id]?.length || 0}
                </Badge>
              </div>
            </div>

            {/* Droppable Area */}
            <Droppable droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 p-2 space-y-2 min-h-[100px] transition-colors ${
                    snapshot.isDraggingOver ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-gray-50/50 dark:bg-gray-900/50'
                  }`}
                >
                  {tasksByStatus[column.id]?.map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`group ${snapshot.isDragging ? 'shadow-lg rotate-1' : ''} ${updating === task.id ? 'opacity-50' : ''}`}
                        >
                          <Card
                            className={`p-3 bg-white dark:bg-gray-800 hover:shadow-md transition-all cursor-pointer border ${
                              isOverdue(task) ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'
                            }`}
                            onClick={() => onTaskClick?.(task)}
                          >
                            <div className="flex items-start gap-2">
                              <div {...provided.dragHandleProps} className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab">
                                <GripVertical className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {task.title}
                                </p>

                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <Badge className={`text-[10px] ${PRIORITY_COLORS[task.priority]}`}>
                                    {PRIORITY_LABELS[task.priority]}
                                  </Badge>
                                  {task.parent_task?.id && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); onTaskClick?.({ ...task, id: task.parent_task!.id, title: task.parent_task!.title }); }}
                                      title={`Pertenece a: ${task.parent_task.title}`}
                                      className="inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full px-2 py-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                                    >
                                      <GitBranch className="h-2.5 w-2.5" />
                                      <span className="truncate max-w-[120px]">{task.parent_task.title}</span>
                                    </button>
                                  )}
                                  {isOverdue(task) && (
                                    <Badge className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Vencida
                                    </Badge>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                                  {task.projects?.name && (
                                    <span className="flex items-center gap-0.5 truncate">
                                      <FolderKanban className="h-3 w-3 shrink-0" />
                                      {task.projects.name}
                                    </span>
                                  )}
                                  {task.due_date && (
                                    <span className="flex items-center gap-0.5">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(task.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                    </span>
                                  )}
                                  {task.estimated_hours && (
                                    <span className="flex items-center gap-0.5">
                                      <Clock className="h-3 w-3" />{task.estimated_hours}h
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-1 mt-2">
                                  {getAssigneeName(task) ? (
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400 min-w-0">
                                      <User className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{getAssigneeName(task)}</span>
                                    </div>
                                  ) : <span />}
                                  <TaskTimer taskId={task.id} variant="compact" providedRunning={runningTimers?.[task.id] ?? null} />
                                </div>
                              </div>
                            </div>
                          </Card>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
