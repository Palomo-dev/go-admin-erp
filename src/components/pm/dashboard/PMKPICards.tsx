'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FolderKanban,
  Target,
  CheckCircle,
  Clock,
  AlertTriangle,
  Milestone,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import type { PMDashboardStats } from '@/lib/services/pmService';

interface PMKPICardsProps {
  stats: PMDashboardStats | null;
  isLoading: boolean;
}

interface KPIItem {
  label: string;
  value: number;
  subLabel?: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export function PMKPICards({ stats, isLoading }: PMKPICardsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-20 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const kpis: KPIItem[] = [
    {
      label: 'Proyectos',
      value: stats.projects.total,
      subLabel: `${stats.projects.active} activos`,
      icon: <FolderKanban className="h-4 w-4" />,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Activos',
      value: stats.projects.active,
      subLabel: 'proyectos',
      icon: <TrendingUp className="h-4 w-4" />,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Metas',
      value: stats.goals.total,
      subLabel: `${stats.goals.achieved} logradas`,
      icon: <Target className="h-4 w-4" />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: 'Tareas',
      value: stats.tasks.total,
      subLabel: `${stats.tasks.done} completadas`,
      icon: <BarChart3 className="h-4 w-4" />,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Pendientes',
      value: stats.tasks.open,
      subLabel: 'tareas',
      icon: <Clock className="h-4 w-4" />,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    {
      label: 'En Progreso',
      value: stats.tasks.inProgress,
      subLabel: 'tareas',
      icon: <TrendingUp className="h-4 w-4" />,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    },
    {
      label: 'Vencidas',
      value: stats.tasks.overdue,
      subLabel: 'tareas',
      icon: <AlertTriangle className="h-4 w-4" />,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      label: 'Hitos',
      value: stats.milestones.total,
      subLabel: `${stats.milestones.completed} completados`,
      icon: <Milestone className="h-4 w-4" />,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className={`${kpi.bgColor} border-0`}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={kpi.color}>{kpi.icon}</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{kpi.label}</span>
            </div>
            <p className={`text-xl sm:text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            {kpi.subLabel && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{kpi.subLabel}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
