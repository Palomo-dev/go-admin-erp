import { redirect } from 'next/navigation';

/** Ruta vieja (fase 2, Figma 20.13 y 20.14): «Nueva ausencia» se registra ahora en un diálogo de Ausencias. */
export default function Page() {
  redirect('/app/hrm/ausencias');
}
