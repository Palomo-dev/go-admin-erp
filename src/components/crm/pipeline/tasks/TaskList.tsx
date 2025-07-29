"use client";

import React from "react";
import { Clock, CheckSquare } from "lucide-react";
import TaskItem from "./TaskItem";

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

interface TaskListProps {
  tasks: Task[];
  onTaskComplete: (taskId: string, completed: boolean) => void;
  isOverdue: (dueDate: string) => boolean;
}

/**
 * Componente de listado de tareas
 * Organiza las tareas en secciones de pendientes y completadas
 */
export default function TaskList({ tasks, onTaskComplete, isOverdue }: TaskListProps) {
  // Separar tareas pendientes y completadas
  const pendingTasks = tasks.filter(task => task.status !== 'completed');
  const completedTasks = tasks.filter(task => task.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Tareas Pendientes */}
      {pendingTasks.length > 0 && (
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Tareas Pendientes ({pendingTasks.length})
          </h4>
          <div className="space-y-3">
            {pendingTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onTaskComplete={onTaskComplete}
                isOverdue={isOverdue}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tareas Completadas */}
      {completedTasks.length > 0 && (
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Tareas Completadas ({completedTasks.length})
          </h4>
          <div className="space-y-3">
            {completedTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onTaskComplete={onTaskComplete}
                isOverdue={isOverdue}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
