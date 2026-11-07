import { redirect } from 'next/navigation';
import { destinoAnomalias } from '@/lib/finanzas/tesoreria/rutas';

// Finanzas, ronda 2 (A1): las alertas son una pestaña de Cuentas de dinero.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoAnomalias(await searchParams));
}
