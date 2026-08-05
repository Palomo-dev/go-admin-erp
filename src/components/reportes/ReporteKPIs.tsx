'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { ReporteKPI } from '@/lib/services/reportes/types';

const formatValor = (valor: string | number, formato?: ReporteKPI['formato']): string => {
  if (typeof valor === 'string') return valor;
  if (formato === 'moneda') {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  }
  if (formato === 'porcentaje') return `${valor}%`;
  return new Intl.NumberFormat('es-CO').format(valor);
};

export function ReporteKPIs({ kpis }: { kpis: ReporteKPI[] }) {
  if (!kpis.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.titulo} className="border-gray-200 dark:border-gray-700">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{kpi.titulo}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatValor(kpi.valor, kpi.formato)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
