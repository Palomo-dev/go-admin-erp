import { Suspense } from 'react';
import { PaginaHoras } from '@/components/hrm/asistencia/PaginasAsistencia';

/** Recursos humanos › Asistencia › horas y recargos de una persona (Figma 20.11.1). */
export default function Page() {
  return (
    <Suspense>
      <PaginaHoras />
    </Suspense>
  );
}
