'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Weight,
  DollarSign,
} from 'lucide-react';
import type { ManifestWithDetails } from '@/lib/services/manifestsService';

interface ManifestStatsProps {
  manifest: ManifestWithDetails;
}

export function ManifestStats({ manifest }: ManifestStatsProps) {
  const total = manifest.total_shipments || 0;
  const delivered = manifest.delivered_count || 0;
  const failed = manifest.failed_count || 0;
  const pending = manifest.pending_count || (total - delivered - failed);
  const progress = total > 0 ? ((delivered + failed) / total) * 100 : 0;
  const successRate = (delivered + failed) > 0 ? (delivered / (delivered + failed)) * 100 : 0;

  const stats = [
    {
      label: 'Total envíos',
      value: total,
      icon: Package,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Entregados',
      value: delivered,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Fallidos',
      value: failed,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-900/30',
    },
    {
      label: 'Pendientes',
      value: pending,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        {/* Estadísticas principales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${stat.bg} mb-2`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Barra de progreso */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Progreso de entregas</span>
            <span className="font-medium text-gray-900 dark:text-white">{progress.toFixed(0)}%</span>
          </div>
          <div className="relative">
            <Progress value={progress} className="h-3" />
            {progress > 0 && (
              <div className="absolute top-0 left-0 h-3 rounded-l-full bg-green-500" style={{ width: `${(delivered / total) * 100}%` }} />
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-green-600 dark:text-green-400">
              {delivered} entregados ({successRate.toFixed(0)}% éxito)
            </span>
            <span className="text-red-600 dark:text-red-400">
              {failed} fallidos
            </span>
          </div>
        </div>

        {/* Totales adicionales */}
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Weight className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {Number(manifest.total_weight_kg || 0).toFixed(1)} kg
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Peso total</p>
            </div>
          </div>
          {manifest.total_cod_amount && Number(manifest.total_cod_amount) > 0 && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  ${Number(manifest.total_cod_amount).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">COD a recaudar</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ManifestStats;
