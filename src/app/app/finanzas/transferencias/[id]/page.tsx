import { redirect } from 'next/navigation';
import { destinoTransferencia } from '@/lib/finanzas/tesoreria/rutas';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(destinoTransferencia(id));
}
