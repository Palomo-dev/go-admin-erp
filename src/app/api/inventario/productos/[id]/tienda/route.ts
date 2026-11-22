import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { claveProducto } from '@/components/inventario/productos/detalle/identProducto';
import { hostPrincipalVerificado } from '@/lib/services/integrations/conexiones/urlsWebhook';
import { enlaceTiendaProducto, type ProductoParaTienda } from '@/lib/inventario/tiendaProducto';
import type { DominioDelSitio } from '@/lib/website/hostSitio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inventario/productos/[id]/tienda — «Ver en la tienda ↗» de la ficha del producto
 * (Figma `2726:193647` / `2726:194089`). `[id]` es el id numérico o el uuid.
 *
 * Con sesión (`withOrg`): la organización es la de la sesión y las dos lecturas filtran por
 * ella con el cliente del usuario (RLS). El dominio es el PRINCIPAL verificado
 * (`hostPrincipalVerificado`); la regla de «se ve en la tienda» está en
 * `lib/inventario/tiendaProducto.ts`. Responde `{ estado: 'sinTienda' }`,
 * `{ estado: 'publicado', url }` o `{ estado: 'noPublicado', motivo }`.
 */
export const GET = withOrg(async (ctx, request, routeParams) => {
  // Regla 5: una organización en la query distinta de la sesión es 403.
  readOrgBody(ctx, {}, { route: 'inventario/productos/[id]/tienda', request });
  const params = await routeParams?.params;
  const ident = typeof params?.id === 'string' ? params.id : '';
  const clave = claveProducto(ident);
  if (!clave) return jsonError(400, 'INVALID_ID', 'Identificador de producto inválido');

  const [productoRes, dominiosRes] = await Promise.all([
    ctx.supabase
      .from('products')
      .select('uuid, status, parent_product_id, padre:products!parent_product_id(uuid, status)')
      .eq('organization_id', ctx.organizationId)
      .eq(clave.campo, clave.valor)
      .maybeSingle(),
    ctx.supabase
      .from('organization_domains')
      .select('host, domain_type, status, is_primary, is_active, updated_at')
      .eq('organization_id', ctx.organizationId)
      .eq('is_primary', true)
      .eq('is_active', true)
      .eq('status', 'verified'),
  ]);

  if (productoRes.error) {
    console.error('[inventario/productos/tienda] products', productoRes.error.message);
    return jsonError(500, 'INTERNAL', 'No se pudo leer el producto');
  }
  if (!productoRes.data) return jsonError(404, 'NOT_FOUND', 'El producto no existe');
  if (dominiosRes.error) {
    // Sin dominio legible no hay enlace: la ficha simplemente no lo muestra.
    console.warn('[inventario/productos/tienda] organization_domains', dominiosRes.error.message);
  }

  const fila = productoRes.data as unknown as Omit<ProductoParaTienda, 'padre'> & {
    padre: ProductoParaTienda['padre'] | NonNullable<ProductoParaTienda['padre']>[];
  };
  const padre = Array.isArray(fila.padre) ? (fila.padre[0] ?? null) : (fila.padre ?? null);
  const host = hostPrincipalVerificado(((dominiosRes.data ?? []) as DominioDelSitio[]).map((d) => ({ ...d, host: String(d.host ?? '') })));

  return Response.json(enlaceTiendaProducto(host, { ...fila, padre }), { headers: { 'Cache-Control': 'no-store' } });
});
