import { redirect } from 'next/navigation';
import { destinoCuentaBancaria } from '@/lib/finanzas/tesoreria/rutas';

/** Detalle viejo de cuenta bancaria → el nuevo; `?edit=true` abre la pestaña Datos. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  redirect(destinoCuentaBancaria(id, await searchParams));
}
