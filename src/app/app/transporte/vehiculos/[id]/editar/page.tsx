'use client';

/**
 * Catálogo común › Editar vehículo (Figma 2970:20719). La pantalla vive en `src/components/transporte/vehiculos/VehiculoFormulario` y es la misma
 * en Logística (que reexporta esta página).
 */
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { VehiculoFormulario } from '@/components/transporte/vehiculos/VehiculoFormulario';

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return (
    <Suspense>
      <VehiculoFormulario key={id} id={id} />
    </Suspense>
  );
}
