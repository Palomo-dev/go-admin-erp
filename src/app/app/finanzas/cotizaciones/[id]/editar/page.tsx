'use client';

import { useParams } from 'next/navigation';
import { EditarCotizacion } from '@/components/finanzas/cotizaciones/editar/EditarCotizacion';

export default function EditarPage() {
  const params = useParams();
  return <EditarCotizacion cotizacionId={params.id as string} />;
}
