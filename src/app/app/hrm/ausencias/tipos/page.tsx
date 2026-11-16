import { redirect } from 'next/navigation';

/** Ruta vieja (fase 2, Figma 20.13 y 20.14): los tipos de ley los siembra la base (fn_hr_tipos_ausencia_asegurar). */
export default function Page() {
  redirect('/app/hrm/ausencias?seccion=permisos');
}
