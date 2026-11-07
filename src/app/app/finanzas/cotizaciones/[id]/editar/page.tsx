'use client';

import { useParams } from 'next/navigation';
import { FormularioCotizacion } from '@/components/finanzas/cotizaciones/formulario/FormularioCotizacion';

/** Editar una cotización en borrador o enviada (la base rechaza las demás). */
export default function EditarCotizacionPage() {
  const params = useParams();
  return (
    <div className="p-4 sm:p-6">
      <FormularioCotizacion id={params?.id as string} />
    </div>
  );
}
