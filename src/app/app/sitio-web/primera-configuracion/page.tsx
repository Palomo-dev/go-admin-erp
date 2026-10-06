'use client';

/**
 * /app/sitio-web/primera-configuracion — asistente de creación del sitio
 * (Figma A/03a-03j): pantalla completa, sin entrada en el menú. Se entra desde
 * el Resumen en «primera vez» (y desde la lista de lanzamiento con `?paso=N`).
 */
import { Suspense } from 'react';
import { AsistenteSitio } from '@/components/sitio-web/resumen/asistente/AsistenteSitio';

export default function PrimeraConfiguracionSitioPage() {
  return (
    <Suspense fallback={null}>
      <AsistenteSitio />
    </Suspense>
  );
}
