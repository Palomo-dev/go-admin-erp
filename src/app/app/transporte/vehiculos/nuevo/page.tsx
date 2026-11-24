'use client';

/**
 * Catálogo común › Nuevo vehículo (Figma 2970:20719). La pantalla vive en `src/components/transporte/vehiculos/VehiculoFormulario` y es la misma
 * en Logística (que reexporta esta página). `?duplicar=<id>` copia otro registro.
 */
import { Suspense } from 'react';
import { VehiculoFormulario } from '@/components/transporte/vehiculos/VehiculoFormulario';

export default function Page() {
  return (
    <Suspense>
      <VehiculoFormulario />
    </Suspense>
  );
}
