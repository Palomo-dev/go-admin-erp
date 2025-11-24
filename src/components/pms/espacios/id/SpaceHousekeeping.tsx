'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle, Clock, AlertCircle, Play, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface HousekeepingTask {
  id: string;
  task_date: string;
  status: string;
  notes?: string;
  created_at: string;
}

interface SpaceHousekeepingProps {
  tasks: HousekeepingTask[];
  onUpdateStatus?: (taskId: string, status: string) => Promise<void>;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'pending':
      return {
        label: 'Pendiente',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        icon: Clock,
      };
    case 'in_progress':
      return {
        label: 'En Proceso',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        icon: Sparkles,
      };
    case 'done':
      return {
        label: 'Completada',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        icon: CheckCircle,
      };
    case 'cancelled':
      return {
        label: 'Cancelada',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        icon: AlertCircle,
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800',
        icon: Clock,
      };
  }
};

export function SpaceHousekeeping({ tasks, onUpdateStatus }: SpaceHousekeepingProps) {
  const latestTask = tasks[0];
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Estado de Limpieza
        </h2>
        <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      </div>

      {/* Estado Actual */}
      {latestTask && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Última tarea
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {format(new Date(latestTask.task_date), 'dd MMMM yyyy', { locale: es })}
              </p>
              {latestTask.notes && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {latestTask.notes}
                </p>
              )}
            </div>
            <Badge className={getStatusInfo(latestTask.status).color}>
              {getStatusInfo(latestTask.status).label}
            </Badge>
          </div>
        </div>
      )}

      {/* Tareas Pendientes */}
      {pendingTasks.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Tareas Pendientes ({pendingTasks.length})
          </h3>
          <div className="space-y-3">
            {pendingTasks.map((task) => {
              const statusInfo = getStatusInfo(task.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div
                  key={task.id}
                  className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <StatusIcon className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {format(new Date(task.task_date), 'dd MMMM', { locale: es })}
                        </p>
                        {task.notes && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {task.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge className={statusInfo.color} variant="outline">
                      {statusInfo.label}
                    </Badge>
                  </div>

                  {/* Botones de acción */}
                  {onUpdateStatus && (
                    <div className="flex gap-2">
                      {task.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(task.id, 'in_progress')}
                          className="flex-1"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Iniciar
                        </Button>
                      )}
                      {(task.status === 'pending' || task.status === 'in_progress') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(task.id, 'done')}
                          className="flex-1 text-green-600 dark:text-green-400"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateStatus(task.id, 'cancelled')}
                        className="text-red-600 dark:text-red-400"
                      >
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historial Reciente */}
      {tasks.length > pendingTasks.length && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Historial Reciente
          </h3>
          <div className="space-y-2">
            {tasks
              .filter(t => t.status === 'done' || t.status === 'cancelled')
              .slice(0, 3)
              .map((task) => {
                const statusInfo = getStatusInfo(task.status);
                
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-2 text-sm"
                  >
                    <span className="text-gray-600 dark:text-gray-400">
                      {format(new Date(task.task_date), 'dd MMM yyyy', { locale: es })}
                    </span>
                    <Badge className={statusInfo.color} variant="outline">
                      {statusInfo.label}
                    </Badge>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-8">
          <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay tareas de limpieza registradas
          </p>
        </div>
      )}
    </Card>
  );
}
