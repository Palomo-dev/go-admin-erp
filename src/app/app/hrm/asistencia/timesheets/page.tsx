import { redirect } from 'next/navigation';

/** Página vieja: la reemplaza Asistencia (Figma 20.10). Se redirige para no dejar enlaces rotos. */
export default function Page() {
  redirect('/app/hrm/asistencia?vista=hojas');
}
