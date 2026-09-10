/**
 * GET    /api/crm/voices — catálogo de voces de la organización.
 * POST   /api/crm/voices — registra una voz (o importa el catálogo de ElevenLabs
 *                          con `{ action: 'import_elevenlabs' }`).
 * PATCH  /api/crm/voices — actualiza una voz (`{ id, ... }`).
 * DELETE /api/crm/voices?id=… — la elimina.
 *
 * La organización SIEMPRE sale de la sesión. Escribir exige rol de administrador.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import {
  listVoices,
  createVoice,
  updateVoice,
  deleteVoice,
  importElevenLabsVoices,
} from '@/lib/services/crm/voiceCatalogService';

export const runtime = 'nodejs';

function fail(error: unknown) {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  const status = (error as { status?: number })?.status;
  console.error('[voices]', message);
  return NextResponse.json({ success: false, error: message }, { status: status && status < 600 ? status : 500 });
}

export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const data = await listVoices(ctx.supabase, ctx.organizationId);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await request.json();

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
    if (error instanceof Error && /consentimiento|Falta|necesita/i.test(error.message)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return fail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await request.json();
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
    requireOrgAdmin(ctx);
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Falta id' }, { status: 400 });
    await deleteVoice(ctx.supabase, ctx.organizationId, id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}
