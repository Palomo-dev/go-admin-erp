'use client';

import type { NotificacionesKPIs as KPIsType } from '@/lib/services/notificacionesDashboardService';

interface NotificacionesKPIsProps {
  kpis: KPIsType | null;
  isLoading: boolean;
}

const kpiConfig = [
  { key: 'pendientes' as const, label: 'Pendientes', color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { key: 'enviadasHoy' as const, label: 'Enviadas Hoy', color: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  { key: 'fallidas' as const, label: 'Fallidas', color: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' },
  { key: 'entregadas' as const, label: 'Entregadas', color: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' },
  { key: 'leidas' as const, label: 'Leídas', color: 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
];

export function NotificacionesKPIs({ kpis, isLoading }: NotificacionesKPIsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpiConfig.map(({ key, label, color }) => (
        <div key={key} className={`rounded-lg border px-3 py-2 ${color}`}>
          <p className="text-xs font-medium opacity-70">{label}</p>
          {isLoading ? (
            <div className="h-6 w-10 bg-current opacity-10 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-lg font-bold">{kpis ? kpis[key] : 0}</p>
          )}
        </div>
      ))}
    </div>
  );
}
