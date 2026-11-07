'use client';

import { useParams } from 'next/navigation';
import { DetalleCotizacion } from '@/components/finanzas/cotizaciones/id/DetalleCotizacion';

/** Detalle de una cotización: lee `GET /api/cotizaciones/[id]` (no encontrada, sin permiso y error en el componente). */
export default function CotizacionDetallePage() {
  const params = useParams();
  return <DetalleCotizacion id={params?.id as string} />;
}
