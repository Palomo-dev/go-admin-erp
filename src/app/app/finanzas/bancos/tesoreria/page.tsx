import { redirect } from 'next/navigation';
import { destinoTesoreriaConsolidada } from '@/lib/finanzas/tesoreria/rutas';

/** La tesorería consolidada es la pestaña «Posición» de Cuentas de dinero. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoTesoreriaConsolidada(await searchParams));
}
