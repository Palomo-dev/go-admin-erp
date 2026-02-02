'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  DollarSign,
  Car,
  Clock,
  TrendingUp,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { ReportSummary } from '@/lib/services/parkingReportService';

interface ReportesSummaryProps {
  summary: ReportSummary;
  isLoading?: boolean;
}

export function ReportesSummary({ summary, isLoading }: ReportesSummaryProps) {
  const stats = [
    {
      label: 'Total Ingresos',
      value: formatCurrency(summary.total_revenue),
      icon: DollarSign,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Total Sesiones',
      value: summary.total_sessions.toLocaleString(),
      icon: Car,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Duración Promedio',
      value: `${summary.avg_duration} min`,
      icon: Clock,
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Ticket Promedio',
      value: formatCurrency(summary.avg_ticket),
      icon: TrendingUp,
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Ocupación',
      value: `${summary.occupancy_rate}%`,
      icon: BarChart3,
      bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
      textColor: 'text-cyan-600 dark:text-cyan-400',
    },
    {
      label: 'Índice Rotación',
      value: `${summary.rotation_index}x`,
      icon: RotateCcw,
      bgColor: 'bg-pink-100 dark:bg-pink-900/30',
      textColor: 'text-pink-600 dark:text-pink-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat, index) => (
        <Card
          key={index}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <CardContent className="p-4">
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.textColor}`} />
                </div>
                <div>
                  <p className={`text-lg font-bold ${stat.textColor}`}>{stat.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default ReportesSummary;
