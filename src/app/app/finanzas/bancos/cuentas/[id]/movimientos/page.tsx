import { redirect } from 'next/navigation';
import { destinoCuentaBancaria } from '@/lib/finanzas/tesoreria/rutas';

/** Los movimientos de la cuenta son la primera pestaña del detalle nuevo. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  redirect(destinoCuentaBancaria(id, await searchParams, true));
}
