import { redirect } from 'next/navigation';
import { destinoReporteFinanzas } from '@/lib/services/reportes/redireccionesFinanzas';

/**
 * Finanzas no tiene reportes propios: este informe vive en el centro de
 * reportes. La ruta vieja se conserva y redirige con su periodo.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoReporteFinanzas('/app/finanzas/contabilidad/mayor-contable', await searchParams));
}
