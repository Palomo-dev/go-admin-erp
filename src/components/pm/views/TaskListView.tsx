'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Check,
  X,
  Trash2,
  CheckCircle2,
  Circle,
  GitBranch,
} from 'lucide-react';
import { type PMTask, type TaskTimeEntry, PRIORITY_COLORS, PRIORITY_LABELS, TASK_STATUS_COLORS, TASK_STATUS_LABELS, TASK_TYPE_LABELS } from '@/lib/services/pmService';
import { pmService } from '@/lib/services/pmService';
import { TaskTimer } from '@/components/pm/TaskTimer';
import { useToast } from '@/components/ui/use-toast';

interface TaskListViewProps {
  tasks: PMTask[];
  onTaskClick?: (task: PMTask) => void;
  onTaskUpdate: () => void;
  users?: Array<{ id: string; nombre: string }>;
  projects?: Array<{ id: string; name: string }>;
  runningTimers?: Record<string, TaskTimeEntry>;
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

export function TaskListView({ tasks, onTaskClick, onTaskUpdate, users = [], projects = [], runningTimers }: TaskListViewProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(tasks.map(t => t.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Aplica cambios en lote a todas las tareas seleccionadas
  const applyBulk = async (updates: Record<string, any>, label: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setApplying(true);
    try {
      await Promise.all(ids.map(id => pmService.updateTask(id, updates)));
      toast({ title: 'Acción aplicada', description: `${label} · ${ids.length} tarea(s)` });
      clearSelection();
      onTaskUpdate();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  // Eliminar tareas seleccionadas
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`¿Eliminar ${ids.length} tarea(s)? Esta acción no se puede deshacer.`)) return;
    setApplying(true);
    try {
      await Promise.all(ids.map(id => pmService.deleteTask(id)));
      toast({ title: 'Tareas eliminadas', description: `${ids.length} tarea(s) eliminada(s)` });
      clearSelection();
      onTaskUpdate();
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  // Agregar etiqueta a tareas seleccionadas
  const handleBulkAddTag = async (tag: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !tag.trim()) return;
    setApplying(true);
    try {
      await Promise.all(ids.map(async id => {
        const task = tasks.find(t => t.id === id);
        const currentTags = task?.tags || [];
        const newTags = [...new Set([...currentTags, tag.trim()])];
        await pmService.updateTask(id, { tags: newTags });
      }));
      toast({ title: 'Etiqueta agregada', description: `'${tag}' · ${ids.length} tarea(s)` });
      clearSelection();
      onTaskUpdate();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  // Asignar horas estimadas
  const handleBulkEstimatedHours = async (hours: string) => {
    const val = parseFloat(hours);
    if (isNaN(val) || val <= 0) return;
    await applyBulk({ estimated_hours: val }, `Horas: ${val}h`);
  };

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
      {/* Barra de acciones masivas */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        <div className="flex items-center gap-2" onClick={toggleSelectAll} role="button">
          <Checkbox checked={allSelected} className="cursor-pointer" />
          <span className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">Seleccionar todo</span>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs">{selectedIds.size} seleccionada(s)</Badge>
            <Select onValueChange={(v) => applyBulk({ status: v }, `Estado: ${TASK_STATUS_LABELS[v]}`)} disabled={applying}>
              <SelectTrigger className="h-8 w-[130px] text-xs bg-white dark:bg-gray-800"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => applyBulk({ priority: v }, `Prioridad: ${PRIORITY_LABELS[v]}`)} disabled={applying}>
              <SelectTrigger className="h-8 w-[130px] text-xs bg-white dark:bg-gray-800"><SelectValue placeholder="Prioridad" /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {users.length > 0 && (
              <Select onValueChange={(v) => applyBulk({ assigned_to: v === 'none' ? null : v }, 'Responsable')} disabled={applying}>
                <SelectTrigger className="h-8 w-[150px] text-xs bg-white dark:bg-gray-800"><SelectValue placeholder="Asignar a" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {projects.length > 0 && (
              <Select onValueChange={(v) => applyBulk({ project_id: v }, 'Proyecto')} disabled={applying}>
                <SelectTrigger className="h-8 w-[150px] text-xs bg-white dark:bg-gray-800"><SelectValue placeholder="Mover a proyecto" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input
              type="date" disabled={applying}
              onChange={(e) => { if (e.target.value) applyBulk({ due_date: e.target.value }, 'Fecha límite'); }}
              className="h-8 w-[150px] text-xs bg-white dark:bg-gray-800"
              title="Fecha límite"
            />
            <Input
              type="number" min="0" step="0.5" disabled={applying}
              placeholder="Horas est."
              onBlur={(e) => { if (e.target.value) handleBulkEstimatedHours(e.target.value); e.target.value = ''; }}
              className="h-8 w-[100px] text-xs bg-white dark:bg-gray-800"
              title="Horas estimadas"
            />
            <Input
              type="text" disabled={applying}
              placeholder="Agregar etiqueta..."
              onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (v.trim()) handleBulkAddTag(v); (e.target as HTMLInputElement).value = ''; } }}
              className="h-8 w-[160px] text-xs bg-white dark:bg-gray-800"
              title="Presionar Enter para agregar"
            />
            <Button variant="outline" size="sm" disabled={applying} onClick={() => applyBulk({ status: 'done' }, 'Marcar completadas')} className="h-8 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Completar
            </Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={() => applyBulk({ status: 'open' }, 'Reabrir')} className="h-8 text-xs">
              <Circle className="h-3.5 w-3.5 mr-1" />Reabrir
            </Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleBulkDelete} className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="h-8 text-xs text-gray-500">
              <X className="h-3.5 w-3.5 mr-1" />Limpiar
            </Button>
          </div>
        )}
      </div>

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
                {/* Checkbox de selección (acciones masivas) */}
                <div className="mt-0.5" onClick={(e) => { e.stopPropagation(); toggleSelect(task.id); }}>
                  <Checkbox checked={selectedIds.has(task.id)} className="cursor-pointer" />
                </div>
                {/* Completar */}
                <button
                  type="button"
                  onClick={(e) => handleToggleDone(task, e)}
                  title="Marcar como completada"
                  className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${task.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'}`}
                >
                  {task.status === 'done' && <Check className="h-3 w-3" />}
                </button>

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
                    {task.parent_task && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onTaskClick?.({ ...task, id: task.parent_task!.id, title: task.parent_task!.title }); }}
                        title={`Pertenece a: ${task.parent_task.title}`}
                        className="inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full px-2 py-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        <GitBranch className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[150px]">{task.parent_task.title}</span>
                      </button>
                    )}
                    {overdue && (
                      <Badge className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Vencida
                      </Badge>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{task.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</p>
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
                    <TaskTimer taskId={task.id} variant="compact" providedRunning={runningTimers?.[task.id] ?? null} />
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
