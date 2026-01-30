'use client';

import { Shield, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AuditStats } from '@/lib/services/chatAuditService';

interface AuditHeaderProps {
  stats: AuditStats;
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
}

export default function AuditHeader({
  stats,
  loading,
  onRefresh,
  onExport
}: AuditHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                Auditoría del Chat
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Registro de todas las acciones realizadas en el módulo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={onExport}
              disabled={loading}
              className="border-gray-300 dark:border-gray-700 gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={loading}
              className="border-gray-300 dark:border-gray-700 gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total de registros</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.today}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Hoy</p>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.thisWeek}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Esta semana</p>
          </div>
        </div>
      </div>
    </div>
  );
}
