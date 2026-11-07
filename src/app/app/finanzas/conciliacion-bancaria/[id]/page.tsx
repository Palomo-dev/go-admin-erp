import { redirect } from 'next/navigation';
import { destinoConciliacion } from '@/lib/finanzas/tesoreria/rutas';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(destinoConciliacion(id));
}
