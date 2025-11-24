'use client';

import React from 'react';
import { TaskCard } from './TaskCard';
import { ClipboardList } from 'lucide-react';
import type { HousekeepingTask } from '@/lib/services/housekeepingService';

interface HousekeepingListProps {
  tasks: HousekeepingTask[];
  onStatusChange: (taskId: string, status: string) => void;
  onEdit: (task: HousekeepingTask) => void;
  onDelete: (taskId: string) => void;
}

export function HousekeepingList({
  tasks,
  onStatusChange,
  onEdit,
  onDelete,
}: HousekeepingListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No hay tareas
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-sm">
          No se encontraron tareas de limpieza con los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
