import { redirect } from 'next/navigation';

/** Préstamos pasó a ser una vista de Nómina (decisión 1 del dueño, Figma 20.21). */
export default function Page() {
  redirect('/app/hrm/nomina?vista=prestamos');
}
