'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ClipboardList, 
  FileEdit, 
  CheckCircle2, 
  XCircle
} from 'lucide-react';
import type { AdjustmentStats as AdjustmentStatsType } from '@/lib/services/adjustmentService';

interface AjustesStatsProps {
  stats: AdjustmentStatsType;
  isLoading?: boolean;
}

export function AjustesStats({ stats, isLoading }: AjustesStatsProps) {
  const statCards = [
    {
      title: 'Total Ajustes',
      value: stats.total.toLocaleString(),
      icon: ClipboardList,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Borradores',
      value: stats.draft.toLocaleString(),
      icon: FileEdit,
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      textColor: 'text-yellow-600 dark:text-yellow-400'
    },
    {
      title: 'Aplicados',
      value: stats.applied.toLocaleString(),
      icon: CheckCircle2,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400'
    },
    {
      title: 'Cancelados',
      value: stats.cancelled.toLocaleString(),
      icon: XCircle,
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-600 dark:text-red-400'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat, index) => (
        <Card 
          key={index} 
          className="border-gray-200 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.textColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {stat.title}
                </p>
                <p className={`text-lg font-semibold ${stat.textColor} truncate`}>
                  {isLoading ? '...' : stat.value}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default AjustesStats;
