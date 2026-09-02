"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { opportunitiesService } from "@/components/crm/oportunidades/opportunitiesService";
import { supabase } from "@/lib/supabase/config";
import { getOrganizationId } from "@/lib/hooks/useOrganization";
import TaskCreationPanel from "@/components/pm/TaskCreationPanel";
import {
  CheckSquare,
  Trash2,
  Calendar,
  Plus,
  Loader2,
  Edit3,
} from "lucide-react";

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
  switch (status?.toLowerCase()) {
    case "completed":
    case "done":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "cancelled":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  }
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
};

export function TasksSection({ opportunityId, customerId, tasks, onTasksChanged }: TasksSectionProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskItem | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; nombre: string }>>([]);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCreating, setQuickCreating] = useState(false);

  // Cargar proyectos y usuarios para el TaskCreationPanel
  useEffect(() => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    supabase
      .from("projects")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name")
      .limit(50)
      .then(({ data }) => setProjects(data || []));
    supabase
      .from("organization_members")
      .select(
        `user_id, profiles:user_id (first_name, last_name)`
      )
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .then(({ data }) => {
        const rows = (data || []) as Array<{
          user_id: string;
          profiles: Array<{ first_name?: string; last_name?: string }> | null;
        }>;
        setUsers(
          rows.map((m) => {
            const p = Array.isArray(m.profiles) ? m.profiles[0] : null;
            return {
              id: m.user_id,
              nombre: `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || "Usuario",
            };
          })
        );
      });
  }, []);

  const handleOpenCreate = () => {
    setEditTask(null);
    setPanelOpen(true);
  };

  const handleOpenEdit = (task: TaskItem) => {
    // Adaptar al formato PMTask esperado por TaskCreationPanel
    setEditTask({
      ...task,
      // PMTask usa campos ligeramente distintos; el panel es tolerante
    } as unknown as import("@/lib/services/pmService").PMTask);
    setPanelOpen(true);
  };

  const handleTaskCreated = () => {
    setPanelOpen(false);
    setEditTask(null);
    onTasksChanged?.();
  };

  const handleQuickCreate = async () => {
    if (!quickTitle.trim()) return;
    setQuickCreating(true);
    try {
      await opportunitiesService.createTask(opportunityId, quickTitle);
      setQuickTitle("");
      onTasksChanged?.();
      toast({ title: "Tarea creada" });
    } catch {
      toast({ title: "Error", description: "No se pudo crear la tarea", variant: "destructive" });
    } finally {
      setQuickCreating(false);
    }
  };

  const handleToggle = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "done" || currentStatus === "completed" ? "open" : "done";
    try {
      await opportunitiesService.updateTask(taskId, { status: newStatus });
      onTasksChanged?.();
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar", variant: "destructive" });
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("¿Eliminar esta tarea?")) return;
    try {
      await opportunitiesService.deleteTask(taskId);
      onTasksChanged?.();
      toast({ title: "Tarea eliminada" });
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
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
        <Button size="sm" onClick={handleQuickCreate} disabled={quickCreating || !quickTitle.trim()} className="h-9 px-3 text-xs shrink-0">
          {quickCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="outline" onClick={handleOpenCreate} className="h-9 px-3 text-xs shrink-0">
          <Edit3 className="h-3.5 w-3.5 mr-1" />
          Avanzado
        </Button>
      </div>

      {/* Lista de tareas */}
      {tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
            >
              <button
                onClick={() => handleToggle(task.id, task.status)}
                className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              >
                <CheckSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenEdit(task)}
                    className={`text-sm font-medium text-left hover:underline ${
                      task.status === "done" || task.status === "completed"
                        ? "line-through text-gray-400"
                        : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {task.title}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className={`text-xs ${getTaskStatusColor(task.status)}`}>{task.status}</Badge>
                    <button onClick={() => handleDelete(task.id)} className="text-gray-400 hover:text-red-500 transition-colors">
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
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay tareas asociadas.</p>
      )}

      {/* Panel PM reutilizado */}
      <TaskCreationPanel
        isOpen={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setEditTask(null);
        }}
        projects={projects}
        users={users}
        existingTasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))}
        editTask={editTask as unknown as import("@/lib/services/pmService").PMTask}
        onTaskCreated={handleTaskCreated}
        initialCustomerId={customerId}
        initialRelatedToType={customerId ? "opportunity" : undefined}
        initialRelatedToId={customerId ? opportunityId : undefined}
      />
    </div>
  );
}
