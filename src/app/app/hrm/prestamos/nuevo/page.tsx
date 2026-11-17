import { redirect } from 'next/navigation';

/** Nuevo préstamo vive ahora bajo Nómina (Figma 20.21.4). */
export default function Page() {
  redirect('/app/hrm/nomina/prestamos/nuevo');
}
