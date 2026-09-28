/**
 * POST /api/pos/cocina/ronda — «Enviar a cocina» del POS de mostrador.
 *
 * Body: `{ cart_id, branch_id, round_key, server_name?, legacy_ticket_id?,
 * void_reason?, lines[] }` con TODAS las líneas del carrito que requieren
 * preparación. `pos_cocina_enviar_ronda` compara con lo ya enviado por línea
 * (id estable de la línea, no nombre + cantidad) y crea, en una transacción,
 * la comanda de lo nuevo y la de ajuste de lo cambiado o quitado. La misma
 * `round_key` dos veces devuelve el resultado de la primera (`replayed`).
 *
 * - La organización sale de la sesión (`getServerOrgContext`); una ajena en el
 *   body → 403 `FOREIGN_ORGANIZATION` y registro. La sucursal del body la
 *   valida la base contra esa organización.
 * - La RPC solo la ejecuta `service_role` y vuelve a comprobar pertenencia.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { errorDeRpcCocina, rondaSchema, sinClavesDeOrganizacion } from '@/lib/pos/cocina/rutasCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/ronda';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function error(status: number, codigo: string) {
  return NextResponse.json({ error: codigo, codigo }, { status, headers: SIN_CACHE });
}

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    const parsed = rondaSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) return error(400, 'datos_invalidos');

    const { data, error: rpcError } = await getServiceClient().rpc('pos_cocina_enviar_ronda', {
      p_organization_id: ctx.organizationId,
      p_actor: ctx.userId,
      p_payload: parsed.data,
    });
    if (rpcError) {
      const traducido = errorDeRpcCocina(rpcError);
      const registro = { organizationId: ctx.organizationId, cartId: parsed.data.cart_id, codigo: traducido.codigo };
      if (traducido.status >= 500) console.error('[pos/cocina/ronda]', { ...registro, message: rpcError.message });
      else if (traducido.status === 403) console.warn('[pos/cocina/ronda] rechazado por la base', registro);
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
