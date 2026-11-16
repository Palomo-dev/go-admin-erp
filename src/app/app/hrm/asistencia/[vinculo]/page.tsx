import { Suspense } from 'react';
import { PaginaHoja } from '@/components/hrm/asistencia/PaginasAsistencia';

/** Recursos humanos › Asistencia › hoja de tiempo de una persona (Figma 20.10.5). */
export default function Page() {
  return (
    <Suspense>
      <PaginaHoja />
    </Suspense>
  );
}
