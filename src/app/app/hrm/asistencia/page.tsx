import { Suspense } from 'react';
import { AsistenciaPage } from '@/components/hrm/asistencia/AsistenciaPage';

/** Recursos humanos › Asistencia: hoy, hojas de tiempo y ajustes (Figma 20.10). */
export default function Page() {
  return (
    <Suspense>
      <AsistenciaPage />
    </Suspense>
  );
}
