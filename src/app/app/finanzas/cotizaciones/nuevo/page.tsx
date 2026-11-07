'use client';

import { FormularioCotizacion } from '@/components/finanzas/cotizaciones/formulario/FormularioCotizacion';

/** Nueva cotización (también `?cliente=`): las piezas del formulario v2 de factura de venta. */
export default function NuevaCotizacionPage() {
  return (
    <div className="p-4 sm:p-6">
      <FormularioCotizacion />
    </div>
  );
}
