'use client';

/**
 * Catálogo común › Conductores y domiciliarios. La pantalla vive en
 * `src/components/transporte/conductores/ConductoresPage.tsx` y es la misma de
 * `/app/logistica/conductores` (que reexporta esta página).
 */
import { ConductoresPage } from '@/components/transporte/conductores/ConductoresPage';

export default function Page() {
  return <ConductoresPage />;
}
