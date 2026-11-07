import { redirect } from 'next/navigation';
import { destinoConciliacion } from '@/lib/finanzas/tesoreria/rutas';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinoConciliacion('nuevo', await searchParams));
}
