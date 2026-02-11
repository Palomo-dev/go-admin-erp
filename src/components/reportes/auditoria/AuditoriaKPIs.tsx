'use client';

import { Activity, Plus, Edit, Trash2, Users, AlertTriangle, Package, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditoriaKPI } from './auditoriaReportService';

interface AuditoriaKPIsProps {
  data: AuditoriaKPI | null;
  isLoading: boolean;
}

const kpiConfig = [
  { key: 'totalEventos' as const, label: 'Total Eventos', icon: Activity, color: 'blue' },
  { key: 'creates' as const, label: 'Creaciones', icon: Plus, color: 'green' },
  { key: 'updates' as const, label: 'Actualizaciones', icon: Edit, color: 'amber' },
  { key: 'deletes' as const, label: 'Eliminaciones', icon: Trash2, color: 'red' },
  { key: 'usuariosActivos' as const, label: 'Usuarios Activos', icon: Users, color: 'indigo' },
  { key: 'erroresIntegracion' as const, label: 'Errores Integr.', icon: AlertTriangle, color: 'orange' },
  { key: 'cambiosProductos' as const, label: 'Cambios Prod.', icon: Package, color: 'purple' },
  { key: 'cambiosFinanzas' as const, label: 'Cambios Finanz.', icon: DollarSign, color: 'cyan' },
];

const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400', text: 'text-blue-700 dark:text-blue-300' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', text: 'text-green-700 dark:text-green-300' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-300' },
  red: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400', text: 'text-red-700 dark:text-red-300' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', icon: 'text-indigo-600 dark:text-indigo-400', text: 'text-indigo-700 dark:text-indigo-300' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400', text: 'text-orange-700 dark:text-orange-300' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', text: 'text-purple-700 dark:text-purple-300' },
  cyan: { bg: 'bg-cyan-50 dark:bg-cyan-900/20', icon: 'text-cyan-600 dark:text-cyan-400', text: 'text-cyan-700 dark:text-cyan-300' },
};

export function AuditoriaKPIs({ data, isLoading }: AuditoriaKPIsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {kpiConfig.map((kpi) => {
        const colors = colorMap[kpi.color] || colorMap.blue;
        const Icon = kpi.icon;
        const value = data ? data[kpi.key] : 0;
        return (
          <div key={kpi.key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`p-1.5 rounded-lg ${colors.bg}`}><Icon className={`h-3.5 w-3.5 ${colors.icon}`} /></div>
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate">{kpi.label}</span>
            </div>
            <p className={`text-base font-bold ${colors.text}`}>{value.toLocaleString('es-CO')}</p>
          </div>
        );
      })}
    </div>
  );
}
