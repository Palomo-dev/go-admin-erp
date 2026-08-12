'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, ShoppingCart, FileText, TrendingUp, Package, Users } from 'lucide-react';
import type { ReportData } from '@/lib/services/reportes/types';

const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

interface ReportesResumenGlobalProps {
  reportes: ReportData[];
  isLoading?: boolean;
}

interface KPIGlobal {
  titulo: string;
  valor: string;
  icono: React.ReactNode;
}

const KPI_ICONS = [
  <DollarSign className="h-4 w-4" />,
  <ShoppingCart className="h-4 w-4" />,
  <Package className="h-4 w-4" />,
  <TrendingUp className="h-4 w-4" />,
  <FileText className="h-4 w-4" />,
  <Users className="h-4 w-4" />,
];

export function ReportesResumenGlobal({ reportes, isLoading }: ReportesResumenGlobalProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                {KPI_ICONS[i]}
              </div>
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-20 mb-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const kpis = extractGlobalKPIs(reportes);
  if (!kpis.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.titulo}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              {kpi.icono}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{kpi.titulo}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{kpi.valor}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function extractGlobalKPIs(reportes: ReportData[]): KPIGlobal[] {
  const kpis: KPIGlobal[] = [];
  const find = (id: string, titulo: string, icono: React.ReactNode) => {
    const r = reportes.find((r) => r.id === id);
    if (!r?.kpis?.length) return;
    const k = r.kpis[0];
    kpis.push({ titulo, valor: formatKPI(k.valor, k.formato), icono });
  };

  find('cierre-caja', 'Ventas del Día', <DollarSign className="h-4 w-4" />);
  find('ventas-periodo', 'Ventas Período', <ShoppingCart className="h-4 w-4" />);
  find('stock-critico', 'Total Productos', <Package className="h-4 w-4" />);
  find('crm-funnel', 'Pipeline CRM', <TrendingUp className="h-4 w-4" />);
  find('cxc-vencidas', 'CxC Vencidas', <FileText className="h-4 w-4" />);
  find('clientes-crecimiento', 'Clientes', <Users className="h-4 w-4" />);

  return kpis.slice(0, 6);
}

function formatKPI(valor: string | number, formato?: 'moneda' | 'numero' | 'porcentaje'): string {
  if (typeof valor === 'string') return valor;
  if (formato === 'moneda') return moneda.format(valor);
  if (formato === 'porcentaje') return `${valor}%`;
  return new Intl.NumberFormat('es-CO').format(valor);
}
