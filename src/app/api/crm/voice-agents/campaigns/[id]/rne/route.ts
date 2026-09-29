/**
 * /api/crm/voice-agents/campaigns/[id]/rne — verificación de la campaña contra
 * el Registro de Números Excluidos (RNE, CRC Colombia).
 *
 *  GET  → última verificación de la campaña y si está vigente (miembro de la org).
 *  POST → carga la lista del RNE (CSV/TXT leído en el navegador y enviado como
 *         texto) y registra la verificación. Exige admin de la organización
 *         (`withOrg(..., { admin: true })` → `requireOrgAdminOrPermission`, el
 *         mismo criterio que «Ejecutar ahora»): quien habilita llamadas a un
 *         lote es quien puede lanzar la campaña.
 *
 * La organización sale de la SESIÓN (regla dura 5): `readOrgBody` convierte una
 * organización ajena en el cuerpo o en la query en 403 + registro. El permiso se
 * resuelve en el servidor (regla dura 6). El trabajo lo hace `rneService` con el
 * cliente service-role, con la organización ya validada.
 */

import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { ultimaVerificacionRne } from '@/lib/services/crm/voiceAgent/cumplimiento';
import { MAX_BYTES_ARCHIVO_RNE, VIGENCIA_RNE_DIAS, verificacionRneVigente } from '@/lib/services/crm/voiceAgent/rne';
import { registrarVerificacionRne, RneValidationError } from '@/lib/services/crm/voiceAgent/rneService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function campaignIdOf(routeParams?: { params: Promise<Record<string, string | string[] | undefined>> }): Promise<string | null> {
  const p = routeParams ? await routeParams.params : {};
  const id = typeof p.id === 'string' ? p.id : null;
  return id && UUID_RE.test(id) ? id : null;
}

export const GET = withOrg(async (ctx, _request, routeParams) => {
  const campaignId = await campaignIdOf(routeParams);
  if (!campaignId) return NextResponse.json({ success: false, error: 'Campaña inválida' }, { status: 400 });
  try {
    // Con la sesión del usuario: la RLS de `voice_campaign_rne_checks` filtra por
    // membresía. `puede_verificar` sale del MISMO predicado que exige el POST.
    const [v, puedeVerificar] = await Promise.all([
      ultimaVerificacionRne(ctx.supabase, ctx.organizationId, campaignId),
      hasOrgAdminOrPermission(ctx),
    ]);
    return NextResponse.json(
      {
        success: true,
        data: v ? { ...v, vigente: verificacionRneVigente(v.valid_until) } : null,
        vigencia_dias: VIGENCIA_RNE_DIAS,
        puede_verificar: puedeVerificar,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[voice-agents/campaigns/rne] GET', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const POST = withOrg(
  async (ctx, request, routeParams) => {
    const campaignId = await campaignIdOf(routeParams);
    if (!campaignId) return NextResponse.json({ success: false, error: 'Campaña inválida' }, { status: 400 });

    // El texto viaja en JSON; se corta antes de parsear si el cuerpo ya es enorme.
    const declarado = Number(request.headers.get('content-length') || 0);
    if (declarado > MAX_BYTES_ARCHIVO_RNE * 1.2) {
      return NextResponse.json({ success: false, error: 'El archivo supera 8 MB.' }, { status: 413 });
    }

    const body = await readOrgBody<{ nombre_archivo?: unknown; contenido?: unknown }>(ctx, request);
    const contenido = typeof body?.contenido === 'string' ? body.contenido : '';
    const nombre = typeof body?.nombre_archivo === 'string' ? body.nombre_archivo : null;

    try {
      const data = await registrarVerificacionRne(getServiceClient(), ctx.organizationId, campaignId, ctx.userId, {
        nombre,
        contenido,
      });
      return NextResponse.json({ success: true, data }, { status: 200, headers: NO_STORE });
    } catch (error) {
      if (error instanceof RneValidationError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
      }
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[voice-agents/campaigns/rne] POST', message);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { admin: true }
);
