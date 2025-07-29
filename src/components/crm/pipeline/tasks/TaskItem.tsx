"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Bell, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import PriorityBadge from "./PriorityBadge";

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority: string;
  status: string;
  completed_at?: string | null;
  remind_before_minutes?: number;
  remind_email: boolean;
  remind_push: boolean;
  created_at: string;
  created_by?: string;
}

interface TaskItemProps {
  task: Task;
  onTaskComplete: (taskId: string, completed: boolean) => void;
  isOverdue?: (dueDate: string) => boolean;
}

/**
 * Componente de ítem individual de tarea
 * Renderiza una tarea con checkbox, información y badges
 */
export default function TaskItem({ task, onTaskComplete, isOverdue }: TaskItemProps) {
  const isCompleted = task.status === 'completed';

  return (
    <div className={`flex items-start gap-3 p-3 border rounded-lg ${isCompleted ? 'opacity-75' : ''}`}>
      <Checkbox
        checked={isCompleted}
        onCheckedChange={(checked) => onTaskComplete(task.id, !!checked)}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h5 className={`font-medium ${isCompleted ? 'line-through' : ''}`}>
            {task.title}
          </h5>
          <PriorityBadge priority={task.priority} />
          
          {/* Badge de estado */}
          {isCompleted ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              Completada
            </Badge>
          ) : (
            task.due_date && isOverdue && isOverdue(task.due_date) && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                Vencida
              </Badge>
            )
          )}
        </div>
        
        {/* Descripción */}
        {task.description && (
          <p className={`text-sm text-muted-foreground mb-2 ${isCompleted ? 'line-through' : ''}`}>
            {task.description}
          </p>
        )}
        
        {/* Información adicional */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {/* Fecha de vencimiento */}
          {task.due_date && !isCompleted && (
            <div className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {format(new Date(task.due_date), "PPp", { locale: es })}
            </div>
          )}
          
          {/* Fecha de completado */}
          {isCompleted && task.completed_at && (
            <div className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              Completada: {format(new Date(task.completed_at), "PPp", { locale: es })}
            </div>
          )}
          
          {/* Recordatorios */}
          {!isCompleted && (task.remind_email || task.remind_push) && task.remind_before_minutes && (
            <div className="flex items-center gap-1">
              <Bell className="h-3 w-3" />
              {task.remind_before_minutes} min antes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
