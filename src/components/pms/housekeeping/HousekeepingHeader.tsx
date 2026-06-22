'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, List, LayoutGrid } from 'lucide-react';

interface HousekeepingHeaderProps {
  viewMode: 'list' | 'kanban';
  onViewModeChange: (mode: 'list' | 'kanban') => void;
  onNewTask: () => void;
}

export function HousekeepingHeader({
  viewMode,
  onViewModeChange,
  onNewTask,
}: HousekeepingHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Gestión de Limpieza
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            Control de tareas de limpieza y ama de llaves
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('list')}
              className={
                viewMode === 'list'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'text-gray-600 dark:text-gray-400'
              }
            >
              <List className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Lista</span>
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('kanban')}
              className={
                viewMode === 'kanban'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'text-gray-600 dark:text-gray-400'
              }
            >
              <LayoutGrid className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Kanban</span>
            </Button>
          </div>

          {/* New Task Button */}
          <Button size="sm" onClick={onNewTask} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarea
          </Button>
        </div>
      </div>
    </div>
  );
}
