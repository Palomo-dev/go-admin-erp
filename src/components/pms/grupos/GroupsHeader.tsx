'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Users, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface GroupsHeaderProps {
  onNewGroup: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function GroupsHeader({ onNewGroup, onRefresh, isRefreshing = false }: GroupsHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reservas Grupales
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestiona grupos de reservas y bloqueos de inventario
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 self-start md:self-auto">
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Actualizar
        </Button>
        <Button
          onClick={onNewGroup}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Grupo
        </Button>
      </div>
    </div>
  );
}
