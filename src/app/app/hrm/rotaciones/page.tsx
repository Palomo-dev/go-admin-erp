import { redirect } from 'next/navigation';

/** Las rotaciones viven ahora en Turnos › Rotaciones (Figma 20.8.8). */
export default function Page() {
  redirect('/app/hrm/turnos?vista=rotaciones');
}
