/**
 * POST /api/pos/cocina/mesa-linea — cambiar la cantidad de un plato de una
 * mesa o anularlo (`cantidad: 0`).
 *
 * Si el plato ya está en cocina, `pos_cocina_ajustar_linea_mesa` crea la
 * comanda de AJUSTE (+/− unidades o anulación) y conserva la original; al
 * anular marca los ítems vivos `cancelled` con el motivo, nunca los borra.
 * Restar o anular algo ya enviado exige motivo (400 `motivo_requerido`).
 *
 * - La organización sale de la sesión; una ajena en el body → 403.
 * - La RPC solo la ejecuta `service_role`; comprueba pertenencia y que la
 *   línea sea de una venta de la organización.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { errorDeRpcCocina, lineaMesaSchema, sinClavesDeOrganizacion } from '@/lib/pos/cocina/rutasCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/mesa-linea';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function error(status: number, codigo: string) {
  return NextResponse.json({ error: codigo, codigo }, { status, headers: SIN_CACHE });
}

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    const parsed = lineaMesaSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) return error(400, 'datos_invalidos');

    const { data, error: rpcError } = await getServiceClient().rpc('pos_cocina_ajustar_linea_mesa', {
      p_organization_id: ctx.organizationId,
      p_actor: ctx.userId,
      p_sale_item_id: parsed.data.sale_item_id,
      p_nueva_cantidad: parsed.data.cantidad,
      p_motivo: parsed.data.motivo ?? null,
    });
    if (rpcError) {
      const traducido = errorDeRpcCocina(rpcError);
      const registro = { organizationId: ctx.organizationId, saleItemId: parsed.data.sale_item_id, codigo: traducido.codigo };
      if (traducido.status >= 500) console.error('[pos/cocina/mesa-linea]', { ...registro, message: rpcError.message });
      else if (traducido.status === 403) console.warn('[pos/cocina/mesa-linea] rechazado por la base', registro);
      return error(traducido.status, traducido.codigo);
    }
    return NextResponse.json({ resultado: data }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code, codigo: err.code }, { status: err.statusCode, headers: SIN_CACHE });
    }
    throw err;
  }
}
