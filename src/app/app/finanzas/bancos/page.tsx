import { redirect } from 'next/navigation';
import { destinoBancos } from '@/lib/finanzas/tesoreria/rutas';

/** «Bancos» pasó a Cuentas de dinero (Tesorería v2): la ruta vieja redirige con su pestaña. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoBancos(await searchParams));
}
