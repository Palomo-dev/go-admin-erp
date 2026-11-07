import { redirect } from 'next/navigation';
import { destinoConciliacion } from '@/lib/finanzas/tesoreria/rutas';

/** Conciliación vive en Tesorería (mapa 1009:86249): la ruta vieja redirige con su filtro. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoConciliacion(null, await searchParams));
}
