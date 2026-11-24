'use client';

/**
 * Catálogo común › Editar conductor o domiciliario (Figma 2971:21208). La pantalla vive en `src/components/transporte/conductores/PersonaFormulario` y es la misma
 * en Logística (que reexporta esta página).
 */
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PersonaFormulario } from '@/components/transporte/conductores/PersonaFormulario';

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return (
    <Suspense>
      <PersonaFormulario key={id} id={id} />
    </Suspense>
  );
}
