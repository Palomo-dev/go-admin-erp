'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { PageHeader } from './PageHeader';
import { CotizacionesTable } from './CotizacionesTable';
import { CotizacionesFiltros } from './CotizacionesFiltros';
import type { QuotationFilters } from '@/lib/services/cotizacionesService';

export function CotizacionesPage() {
  const [filtrosActuales, setFiltrosActuales] = useState<QuotationFilters>({
    busqueda: '',
    status: 'todos',
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeader />
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <CotizacionesFiltros onFiltrosChange={setFiltrosActuales} />
          <CotizacionesTable filtros={filtrosActuales} />
        </div>
      </Card>
    </div>
  );
}
