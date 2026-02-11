'use client';

import { Package, Boxes, DollarSign, AlertTriangle, AlertCircle, TrendingDown, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import type { InventarioKPI } from './inventarioReportService';

interface InventarioKPIsProps {
  data: InventarioKPI | null;
  isLoading: boolean;
}

const kpiConfig = [
  { key: 'totalProductos' as const, label: 'Productos', icon: Package, color: 'blue', isCurrency: false },
  { key: 'totalUnidades' as const, label: 'Unidades', icon: Boxes, color: 'indigo', isCurrency: false },
  { key: 'valorInventario' as const, label: 'Valorización', icon: DollarSign, color: 'green', isCurrency: true },
  { key: 'productosStockCritico' as const, label: 'Sin Stock', icon: AlertCircle, color: 'red', isCurrency: false },
  { key: 'productosStockBajo' as const, label: 'Bajo Mínimo', icon: AlertTriangle, color: 'amber', isCurrency: false },
  { key: 'productosSobrestock' as const, label: 'Sobrestock', icon: TrendingDown, color: 'purple', isCurrency: false },
  { key: 'movimientosEntrada' as const, label: 'Entradas', icon: ArrowDownToLine, color: 'emerald', isCurrency: false },
  { key: 'movimientosSalida' as const, label: 'Salidas', icon: ArrowUpFromLine, color: 'orange', isCurrency: false },
];

const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400', text: 'text-blue-700 dark:text-blue-300' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', icon: 'text-indigo-600 dark:text-indigo-400', text: 'text-indigo-700 dark:text-indigo-300' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', text: 'text-green-700 dark:text-green-300' },
  red: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400', text: 'text-red-700 dark:text-red-300' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-300' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', text: 'text-purple-700 dark:text-purple-300' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400', text: 'text-emerald-700 dark:text-emerald-300' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400', text: 'text-orange-700 dark:text-orange-300' },
};

export function InventarioKPIs({ data, isLoading }: InventarioKPIsProps) {
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
            <p className={`text-base font-bold ${colors.text}`}>
              {kpi.isCurrency ? formatCurrency(value) : value.toLocaleString('es-CO')}
            </p>
          </div>
        );
      })}
    </div>
  );
}
