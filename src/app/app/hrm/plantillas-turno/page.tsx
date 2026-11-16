import { redirect } from 'next/navigation';

/** Las plantillas de turno viven ahora en Turnos › Plantillas (Figma 20.8.7). */
export default function Page() {
  redirect('/app/hrm/turnos?vista=plantillas');
}
