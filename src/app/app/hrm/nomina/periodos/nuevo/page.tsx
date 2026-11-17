import { redirect } from 'next/navigation';

/** «Nuevo período» ahora es un diálogo de Nómina › Períodos (Figma 20.16.2). */
export default function Page() {
  redirect('/app/hrm/nomina');
}
