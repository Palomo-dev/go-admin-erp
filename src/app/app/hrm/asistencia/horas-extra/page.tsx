import { Suspense } from 'react';
import { TopesPage } from '@/components/hrm/asistencia/TopesPage';

/** Recursos humanos › Horas extra y recargos: alertas de topes del período (Figma 20.11.3). */
export default function Page() {
  return (
    <Suspense>
      <TopesPage />
    </Suspense>
  );
}
