/**
 * POST /api/pos/cocina/alergia — la cocina confirma la alergia de una comanda.
 *
 * Hasta la confirmación la base no deja pasar la comanda (ni sus ítems) a
 * preparación o lista (disparador `trg_kitchen_ticket_alergia_guarda`). La
 * confirmación queda con quién (el usuario de la SESIÓN, nunca del body) y
 * cuándo. Idempotente.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { alergiaSchema, errorDeRpcCocina, sinClavesDeOrganizacion } from '@/lib/pos/cocina/rutasCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/alergia';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function error(status: number, codigo: string) {
  return NextResponse.json({ error: codigo, codigo }, { status, headers: SIN_CACHE });
}

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    const parsed = alergiaSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) return error(400, 'datos_invalidos');

    const { data, error: rpcError } = await getServiceClient().rpc('pos_cocina_confirmar_alergia', {
      p_organization_id: ctx.organizationId,
      p_actor: ctx.userId,
      p_ticket_id: parsed.data.ticket_id,
    });
    if (rpcError) {
      const traducido = errorDeRpcCocina(rpcError);
      if (traducido.status >= 500) {
        console.error('[pos/cocina/alergia]', { organizationId: ctx.organizationId, ticketId: parsed.data.ticket_id, message: rpcError.message });
      }
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
