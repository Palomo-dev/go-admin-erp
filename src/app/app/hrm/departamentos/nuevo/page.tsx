import { redirect } from 'next/navigation';

/** «Departamentos» pasó a llamarse «Áreas». */
export default function Page() {
  redirect('/app/hrm/areas/nueva');
}
