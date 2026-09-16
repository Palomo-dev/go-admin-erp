/**
 * GET    /api/crm/voices — catálogo de voces de la organización, enriquecido con
 *                          `preview_url` y etiquetas del proveedor cuando las hay, más
 *                          `account` (plan del proveedor: `free_tier`, `can_clone`) o `null`.
 * POST   /api/crm/voices — registra una voz (o importa el workspace de ElevenLabs
 *                          con `{ action: 'import_elevenlabs' }`).
 * PATCH  /api/crm/voices — actualiza una voz (`{ id, ... }`).
 * DELETE /api/crm/voices?id=… — la elimina del catálogo y, si esta cuenta la copió
 *                          o clonó y ninguna otra organización la usa, del proveedor.
 *
 * La organización SIEMPRE sale de la sesión. Escribir exige rol de administrador.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  createVoice,
  updateVoice,
  importElevenLabsVoices,
} from '@/lib/services/crm/voiceCatalogService';
import { getAccountCapabilities, listVoicesEnriched, removeVoice } from '@/lib/services/crm/voiceLibraryService';
import { describeLibraryError } from '@/lib/services/crm/voiceLibrary';
import { ElevenLabsError } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';

/**
 * Regla dura 5 (CLAUDE.md): la organización sale de la sesión. Si el body trae
 * otra, 403 y se registra; la misma no es un ataque y se ignora (nunca se usa).
 */

function fail(error: unknown) {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  if (error instanceof ElevenLabsError) {
    return NextResponse.json({ success: false, error: describeLibraryError(error) }, { status: 502 });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  const status = (error as { status?: number })?.status;
  console.error('[voices]', message);
  return NextResponse.json({ success: false, error: message }, { status: status && status < 600 ? status : 500 });
}

export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const [data, account] = await Promise.all([
      listVoicesEnriched(ctx.supabase, ctx.organizationId),
      // Plan del proveedor (solo lectura) para avisar antes del clic; `null` si no se sabe.
      getAccountCapabilities(ctx.organizationId),
    ]);
    return NextResponse.json({ success: true, data, account }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await readOrgBody(ctx, request);

    if (body?.action === 'import_elevenlabs') {
      const result = await importElevenLabsVoices(ctx.supabase, ctx.organizationId);
      return NextResponse.json({ success: true, data: result }, { status: 200 });
    }

    if (!body?.provider_voice_id || !body?.name) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: provider_voice_id, name' },
        { status: 400 }
      );
    }
    const data = await createVoice(ctx.supabase, ctx.organizationId, body, ctx.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    if (error instanceof Error && /consentimiento|Falta|necesita|caracteres/i.test(error.message)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return fail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await readOrgBody(ctx, request);
    if (!body?.id) return NextResponse.json({ success: false, error: 'Falta id' }, { status: 400 });
    const { id, ...rest } = body;
    const data = await updateVoice(ctx.supabase, ctx.organizationId, id, rest);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    await readOrgBody(ctx, request);
    requireOrgAdmin(ctx);
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Falta id' }, { status: 400 });
    const orgId = ctx.organizationId;
    // Con clave de plataforma compartida, otra organización puede tener la misma voz
    // del proveedor: solo se borra allí si nadie más la referencia (service role,
    // porque el RLS del usuario no ve las filas de otras organizaciones).
    const countOtherReferences = async (providerVoiceId: string) => {
      const { count, error } = await getServiceClient()
        .from('voices')
        .select('id', { count: 'exact', head: true })
        .eq('provider', 'elevenlabs')
        .eq('provider_voice_id', providerVoiceId)
        .neq('organization_id', orgId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    };
    const data = await removeVoice(ctx.supabase, orgId, id, countOtherReferences);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}
