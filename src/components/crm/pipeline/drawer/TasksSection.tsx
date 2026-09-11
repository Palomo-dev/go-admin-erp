"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { TaskDialog } from "@/components/crm/shared/TaskDialog";
import {
  crmTaskService,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  normalizeTaskPriority,
  normalizeTaskStatus,
} from "@/lib/services/crm/taskService";
import type { PMTask } from "@/lib/services/pmService";
import {
  CheckSquare,
  Trash2,
  Calendar,
  Plus,
  Loader2,
  Edit3,
} from "lucide-react";
import { formatPlainDate } from "@/lib/utils/dateDisplay";

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  description?: string | null;
  assigned_to?: string | null;
}

interface TasksSectionProps {
  opportunityId: string;
  customerId?: string;
  tasks: TaskItem[];
  onTasksChanged?: () => void;
}

const getTaskStatusColor = (status: string) => {
  switch (normalizeTaskStatus(status)) {
    case "done":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "canceled":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  }
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  return formatPlainDate(dateStr, { day: "2-digit", month: "short", year: "numeric" });
};

export function TasksSection({ opportunityId, customerId, tasks, onTasksChanged }: TasksSectionProps) {
  // Un único diálogo para todo: `mode` decide si abre compacto o completo.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"compact" | "full">("compact");
  const [editTask, setEditTask] = useState<PMTask | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCreating, setQuickCreating] = useState(false);

  const openCreate = (mode: "compact" | "full") => {
    setEditTask(null);
    setDialogMode(mode);
    setDialogOpen(true);
  };

  const handleOpenEdit = (task: TaskItem) => {
    setEditTask(task as unknown as PMTask);
    setDialogMode("full");
    setDialogOpen(true);
  };

  /**
   * Atajo de una línea: mismo servicio de guardado que el diálogo, así que la
   * prioridad y el estado se normalizan igual (antes escribía `medium` y el
   * CHECK `tasks_priority_check` rechazaba la fila).
   */
  const handleQuickCreate = async () => {
    if (!quickTitle.trim()) return;
    setQuickCreating(true);
    try {
      await crmTaskService.createTask({
        title: quickTitle,
        related_to_type: "opportunity",
        related_to_id: opportunityId,
        customer_id: customerId ?? null,
        type: "crm",
      });
      setQuickTitle("");
      onTasksChanged?.();
      toast({ title: "Tarea creada" });
    } catch (err) {
      toast({
        title: "No se pudo crear la tarea",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setQuickCreating(false);
    }
  };

  const handleToggle = async (taskId: string, currentStatus: string) => {
    const nextStatus = normalizeTaskStatus(currentStatus) === "done" ? "open" : "done";
    try {
      await crmTaskService.setTaskStatus(taskId, nextStatus);
      onTasksChanged?.();
    } catch (err) {
      toast({
        title: "No se pudo actualizar la tarea",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("¿Eliminar esta tarea?")) return;
    try {
      await crmTaskService.deleteTask(taskId);
      onTasksChanged?.();
      toast({ title: "Tarea eliminada" });
    } catch (err) {
      toast({
        title: "No se pudo eliminar la tarea",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Creación rápida */}
      <div className="flex gap-2">
        <Input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Título de la tarea..."
          className="text-sm flex-1 h-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleQuickCreate();
          }}
        />
        <Button size="sm" onClick={handleQuickCreate} disabled={quickCreating || !quickTitle.trim()} className="h-9 px-3 text-xs shrink-0" aria-label="Crear tarea">
          {quickCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="outline" onClick={() => openCreate("full")} className="h-9 px-3 text-xs shrink-0">
          <Edit3 className="h-3.5 w-3.5 mr-1" />
          Avanzado
        </Button>
      </div>

      {/* Lista de tareas */}
      {tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map((task) => {
            const status = normalizeTaskStatus(task.status);
            const priority = normalizeTaskPriority(task.priority);
            return (
              <div
                key={task.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
              >
                <button
                  onClick={() => handleToggle(task.id, task.status)}
                  aria-label={status === "done" ? "Reabrir tarea" : "Marcar como completada"}
                  className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenEdit(task)}
                      className={`text-sm font-medium text-left hover:underline ${
                        status === "done" ? "line-through text-gray-400" : "text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {task.title}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className={`text-xs ${getTaskStatusColor(task.status)}`}>{TASK_STATUS_LABELS[status]}</Badge>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{TASK_PRIORITY_LABELS[priority]}</span>
                      <button
                        onClick={() => handleDelete(task.id)}
                        aria-label="Eliminar tarea"
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {task.description && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{task.description}</p>}
                  {task.due_date && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3" />
                      Vence: {formatDate(task.due_date)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay tareas asociadas.</p>
      )}

      {/* Diálogo unificado: compacto o completo, misma lógica de guardado */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTask(null);
        }}
        mode={dialogMode}
        relatedType="opportunity"
        relatedId={opportunityId}
        customerId={customerId}
        editTask={editTask}
        siblingTasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))}
        onSaved={() => onTasksChanged?.()}
      />
    </div>
  );
}
