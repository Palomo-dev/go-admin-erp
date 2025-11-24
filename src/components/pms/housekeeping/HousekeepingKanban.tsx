'use client';

import React from 'react';
import { TaskCard } from './TaskCard';
import { Clock, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import type { HousekeepingTask } from '@/lib/services/housekeepingService';

interface HousekeepingKanbanProps {
  tasks: HousekeepingTask[];
  onStatusChange: (taskId: string, status: string) => void;
  onEdit: (task: HousekeepingTask) => void;
  onDelete: (taskId: string) => void;
}

export function HousekeepingKanban({
  tasks,
  onStatusChange,
  onEdit,
  onDelete,
}: HousekeepingKanbanProps) {
  const columns = [
    {
      status: 'pending',
      title: 'Pendientes',
      icon: Clock,
      color: 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700',
      textColor: 'text-yellow-700 dark:text-yellow-400',
    },
    {
      status: 'in_progress',
      title: 'En Progreso',
      icon: PlayCircle,
      color: 'bg-blue-100 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700',
      textColor: 'text-blue-700 dark:text-blue-400',
    },
    {
      status: 'done',
      title: 'Completadas',
      icon: CheckCircle2,
      color: 'bg-green-100 dark:bg-green-900/20 border-green-300 dark:border-green-700',
      textColor: 'text-green-700 dark:text-green-400',
    },
    {
      status: 'cancelled',
      title: 'Canceladas',
      icon: XCircle,
      color: 'bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-700',
      textColor: 'text-red-700 dark:text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {columns.map((column) => {
        const Icon = column.icon;
        const columnTasks = tasks.filter((task) => task.status === column.status);

        return (
          <div key={column.status} className="flex flex-col">
            {/* Column Header */}
            <div
              className={`p-4 rounded-t-lg border-2 ${column.color} flex items-center justify-between`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${column.textColor}`} />
                <h3 className={`font-semibold ${column.textColor}`}>
                  {column.title}
                </h3>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-semibold ${column.textColor} bg-white dark:bg-gray-900`}
              >
                {columnTasks.length}
              </span>
            </div>

            {/* Column Content */}
            <div className="flex-1 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg border-2 border-t-0 border-gray-200 dark:border-gray-700 p-3 space-y-3 min-h-[400px]">
              {columnTasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No hay tareas
                  </p>
                </div>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={onStatusChange}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
