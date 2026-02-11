'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import type { AlertStats } from './types';

interface AlertasHeaderProps {
  stats: AlertStats | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isAdmin: boolean;
  onRefresh: () => void;
  onCreateNew: () => void;
}

export function AlertasHeader({
  stats,
  isLoading,
  isRefreshing,
  isAdmin,
  onRefresh,
  onCreateNew,
}: AlertasHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/notificaciones"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Centro de Alertas
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {stats
                  ? `${stats.total} total · ${stats.pending} pendientes · ${stats.critical} críticas`
                  : 'Cargando...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing || isLoading}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Actualizar
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                onClick={onCreateNew}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Alerta
              </Button>
            )}
          </div>
        </div>
      </div>

      {stats && (
        <div className="px-4 sm:px-6 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total" value={stats.total} color="blue" />
            <StatCard label="Pendientes" value={stats.pending} color="amber" />
            <StatCard label="Críticas" value={stats.critical} color="red" />
            <StatCard label="Resueltas" value={stats.resolved} color="green" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    red: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  };

  return (
    <div className={cn('rounded-lg border px-3 py-2', colors[color])}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
