'use client';

/**
 * Catálogo común › ficha del vehículo. La pantalla vive en
 * `src/components/transporte/vehiculos/VehiculoDetalle.tsx` y es la misma de
 * `/app/logistica/vehiculos/[id]` (que reexporta esta página).
 */
import { useParams } from 'next/navigation';
import { VehiculoDetalle } from '@/components/transporte/vehiculos/VehiculoDetalle';

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return <VehiculoDetalle key={id} id={id} />;
}
