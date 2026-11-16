import { redirect } from 'next/navigation';

/** «Departamentos» pasó a llamarse «Áreas» (decisión 1 del dueño, fase 1 de RR. HH.). */
export default function Page() {
  redirect('/app/hrm/areas');
}
