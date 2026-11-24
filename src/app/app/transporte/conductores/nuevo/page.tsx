'use client';

/**
 * Catálogo común › Nuevo conductor o domiciliario (Figma 2971:21208). La pantalla vive en `src/components/transporte/conductores/PersonaFormulario` y es la misma
 * en Logística (que reexporta esta página). `?duplicar=<id>` copia otro registro.
 */
import { Suspense } from 'react';
import { PersonaFormulario } from '@/components/transporte/conductores/PersonaFormulario';

export default function Page() {
  return (
    <Suspense>
      <PersonaFormulario />
    </Suspense>
  );
}
