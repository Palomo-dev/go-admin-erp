import { Suspense } from 'react';
import { MisEnviosPantalla } from '@/components/logistica/misEnvios/MisEnviosPantalla';

/**
 * Logística › Mis envíos: la ruta del domiciliario de la sesión (Figma 2801:3939) y, con
 * `?domiciliario=`, «Ver la ruta de» del supervisor. Suspense: la pantalla lee los parámetros de
 * la URL (`useSearchParams`).
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MisEnviosPantalla />
    </Suspense>
  );
}
