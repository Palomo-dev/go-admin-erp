'use client';

import { Briefcase, RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AIJobStats } from '@/lib/services/aiJobsService';

interface JobsHeaderProps {
  stats: AIJobStats | null;
  loading: boolean;
  onRefresh: () => void;
  onSettings: () => void;
}

export default function JobsHeader({
  stats,
  loading,
  onRefresh,
  onSettings
}: JobsHeaderProps) {
  const statItems = [
    { label: 'Total', value: stats?.total || 0, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800' },
    { label: 'Pendientes', value: stats?.pending || 0, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
    { label: 'Ejecutando', value: stats?.running || 0, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
    { label: 'Completados', value: stats?.completed || 0, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
    { label: 'Fallidos', value: stats?.failed || 0, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' }
  ];

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Briefcase className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                Trabajos de IA
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Monitorea y gestiona los trabajos de procesamiento de IA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              onClick={onSettings}
              className="border-gray-300 dark:border-gray-700 gap-2"
            >
              <Settings className="h-4 w-4" />
              Configuración
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {statItems.map((item) => (
            <Card
              key={item.label}
              className={`p-3 ${item.bgColor} border-0`}
            >
              <p className={`text-2xl font-bold ${item.color}`}>
                {loading ? '-' : item.value}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {item.label}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
