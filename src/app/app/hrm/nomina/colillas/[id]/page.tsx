import { redirect } from 'next/navigation';

/** La colilla vieja (por id de colilla) se abre ahora desde su período (Figma 20.23.1). */
export default function Page() {
  redirect('/app/hrm/nomina');
}
