'use client';

import { NuevaCotizacionForm } from '@/components/finanzas/cotizaciones/nueva-cotizacion/NuevaCotizacionForm';

export default function NuevoPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <NuevaCotizacionForm />
    </div>
  );
}
