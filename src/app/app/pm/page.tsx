'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderKanban } from 'lucide-react';
import { pmService, type PMDashboardStats, type PMTask } from '@/lib/services/pmService';
import { PMQuickNav, PMQuickActions } from '@/components/pm/dashboard/PMQuickNav';
import { PMKPICards } from '@/components/pm/dashboard/PMKPICards';
import { PMRecentActivity } from '@/components/pm/dashboard/PMRecentActivity';

export default function PMDashboardPage() {
  const emptyStats: PMDashboardStats = { projects: { total: 0, active: 0, completed: 0, onHold: 0 }, goals: { total: 0, active: 0, achieved: 0 }, tasks: { total: 0, open: 0, inProgress: 0, done: 0, overdue: 0 }, milestones: { total: 0, completed: 0, pending: 0 } };
  const [stats, setStats] = useState<PMDashboardStats>(emptyStats);
  const [recentTasks, setRecentTasks] = useState<PMTask[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, recent] = await Promise.all([
        pmService.getDashboardStats(),
        pmService.getRecentTasks(8),
      ]);
      setStats(statsData);
      setRecentTasks(recent);
    } catch (error) {
      console.error('Error cargando dashboard PM:', error);
      setStats(emptyStats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FolderKanban className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Gestión de Proyectos
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 capitalize hidden sm:block">
                {new Date().toLocaleDateString('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <PMQuickActions />
        </div>
      </div>

      {/* Navegación rápida */}
      <PMQuickNav />

      {/* KPIs */}
      <PMKPICards stats={stats} isLoading={loading} />

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución de tareas por estado */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base dark:text-white">Distribución de Tareas</CardTitle>
            <CardDescription className="dark:text-gray-400">Estado actual de tareas en proyectos</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Pendientes', value: stats.tasks.open, color: 'bg-gray-400 dark:bg-gray-500', total: stats.tasks.total },
                  { label: 'En Progreso', value: stats.tasks.inProgress, color: 'bg-yellow-400 dark:bg-yellow-500', total: stats.tasks.total },
                  { label: 'Completadas', value: stats.tasks.done, color: 'bg-green-400 dark:bg-green-500', total: stats.tasks.total },
                  { label: 'Vencidas', value: stats.tasks.overdue, color: 'bg-red-400 dark:bg-red-500', total: stats.tasks.total },
                ].map((item) => {
                  const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{item.value} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actividad reciente */}
        <PMRecentActivity tasks={recentTasks} isLoading={loading} />
      </div>

      {/* Resumen de proyectos activos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base dark:text-white">Resumen Rápido</CardTitle>
              <CardDescription className="dark:text-gray-400">Estado general de la gestión de proyectos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading || !stats ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.projects.active}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Proyectos Activos</p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.projects.completed}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Completados</p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.goals.achieved}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Metas Logradas</p>
              </div>
              <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.milestones.completed}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Hitos Completados</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
