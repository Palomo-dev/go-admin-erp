'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Calendar, MapPin, User, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { HousekeepingTask } from '@/lib/services/housekeepingService';

interface TaskCardProps {
  task: HousekeepingTask;
  onStatusChange: (taskId: string, status: string) => void;
  onEdit: (task: HousekeepingTask) => void;
  onDelete: (taskId: string) => void;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'pending':
      return {
        label: 'Pendiente',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      };
    case 'in_progress':
      return {
        label: 'En Progreso',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      };
    case 'done':
      return {
        label: 'Completada',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      };
    case 'cancelled':
      return {
        label: 'Cancelada',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      };
  }
};

export function TaskCard({ task, onStatusChange, onEdit, onDelete }: TaskCardProps) {
  const statusInfo = getStatusInfo(task.status);

  return (
    <Card className="p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {task.spaces?.label || 'Sin espacio'}
          </h3>
          {task.spaces?.space_types && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {task.spaces.space_types.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(task)}>
                Editar
              </DropdownMenuItem>
              {task.status === 'pending' && (
                <DropdownMenuItem
                  onClick={() => onStatusChange(task.id, 'in_progress')}
                >
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Iniciar
                </DropdownMenuItem>
              )}
              {task.status === 'in_progress' && (
                <DropdownMenuItem onClick={() => onStatusChange(task.id, 'done')}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Completar
                </DropdownMenuItem>
              )}
              {task.status !== 'cancelled' && task.status !== 'done' && (
                <DropdownMenuItem
                  onClick={() => onStatusChange(task.id, 'cancelled')}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(task.id)}
                className="text-red-600 dark:text-red-400"
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        {task.spaces?.floor_zone && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <MapPin className="h-4 w-4" />
            <span>{task.spaces.floor_zone}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <Calendar className="h-4 w-4" />
          <span>{format(new Date(task.task_date), 'PPP', { locale: es })}</span>
        </div>

        {task.assigned_user && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <User className="h-4 w-4" />
            <span>{task.assigned_user.email}</span>
          </div>
        )}

        {task.notes && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 text-sm">{task.notes}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
