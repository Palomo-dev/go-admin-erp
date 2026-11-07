import { redirect } from 'next/navigation';
import { destinoTransferencia } from '@/lib/finanzas/tesoreria/rutas';

/** Transferencias vive en Tesorería: la ruta vieja redirige con su filtro. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoTransferencia(null, await searchParams));
}
