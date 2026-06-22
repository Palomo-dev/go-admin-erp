'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  User,
  FolderKanban,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { type PMTask, TASK_STATUS_COLORS, TASK_STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/services/pmService';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PMRecentActivityProps {
  tasks: PMTask[];
  isLoading: boolean;
}

export function PMRecentActivity({ tasks, isLoading }: PMRecentActivityProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-3/4 mb-1" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base dark:text-white">Actividad Reciente</CardTitle>
            <CardDescription className="dark:text-gray-400">Últimas tareas actualizadas</CardDescription>
          </div>
          <Link href="/app/pm/tareas">
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todas <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No hay actividad reciente</p>
        ) : (
          tasks.map((task) => {
            const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
            const name = task.profiles
              ? `${task.profiles.first_name || ''} ${task.profiles.last_name || ''}`.trim() || task.profiles.email
              : null;

            return (
              <div key={task.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className={`p-1.5 rounded-full mt-0.5 ${
                  task.status === 'done' ? 'bg-green-100 dark:bg-green-900/30' :
                  task.status === 'in_progress' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                  'bg-gray-100 dark:bg-gray-800'
                }`}>
                  {task.status === 'done' ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  ) : overdue ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium text-gray-900 dark:text-white truncate ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {task.projects?.name && (
                      <span className="flex items-center gap-0.5">
                        <FolderKanban className="h-3 w-3" />{task.projects.name}
                      </span>
                    )}
                    {name && (
                      <span className="flex items-center gap-0.5">
                        <User className="h-3 w-3" />{name}
                      </span>
                    )}
                    <Badge className={`text-[9px] py-0 px-1 ${TASK_STATUS_COLORS[task.status]}`}>
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
