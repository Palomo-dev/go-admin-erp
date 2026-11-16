import { Suspense } from 'react';
import { PaginaTurno } from '@/components/hrm/asistencia/PaginasAsistencia';

/** Recursos humanos › Asistencia › un turno con la vigencia aplicada (Figma 20.11.2). */
export default function Page() {
  return (
    <Suspense>
      <PaginaTurno />
    </Suspense>
  );
}
