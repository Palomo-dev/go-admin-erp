import { redirect } from 'next/navigation';

/**
 * D1 (CRM ola 3A, plan §4.11): una sola ficha del cliente, `/app/clientes/[id]`,
 * con el bloque CRM (acciones rápidas, «Nueva oportunidad», salud, folios y
 * documentos). Esta ruta queda solo para no romper los enlaces viejos.
 */
export default async function FichaCrmRedirige({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/clientes/${encodeURIComponent(id)}`);
}
