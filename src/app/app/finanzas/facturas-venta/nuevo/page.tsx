'use client';

import FormularioFacturaVenta from '@/components/finanzas/facturas-venta/formulario/FormularioFacturaVenta';

/** Nueva factura de venta (también duplicar, ?cliente= y oportunidad): el formulario v2. */
export default function NuevaFacturaVentaPage() {
  return (
    <div className="p-4 sm:p-6">
      <FormularioFacturaVenta />
    </div>
  );
}
