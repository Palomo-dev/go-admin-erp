import { redirect } from 'next/navigation';

/**
 * Ruta vieja: los valores viven en la pestaña «Valores» de
 * /app/inventario/variantes. `?tipo=<id>` pasa como filtro de tipo (solo si es
 * un id numérico).
 */
export default async function InventarioVariantesValoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const { tipo } = await searchParams;
  const id = typeof tipo === 'string' && /^\d+$/.test(tipo) ? tipo : null;
  redirect(id ? `/app/inventario/variantes?tab=valores&v_tipo=${id}` : '/app/inventario/variantes?tab=valores');
}
