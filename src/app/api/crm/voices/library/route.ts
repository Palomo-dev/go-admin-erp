/**
 * GET  /api/crm/voices/library — biblioteca pública de ElevenLabs (`/v1/shared-voices`).
 *      ?search=&language=es|en|all&gender=&use_case=&page=0
 * POST /api/crm/voices/library — «Añadir a mis voces»: copia la voz al workspace y
 *      la registra en el catálogo de la organización. `{ voice_id, public_owner_id, name,
 *      description?, language? }`, acotado por `sanitizeAddLibraryInput` (R13).
 *
 * La organización sale de la sesión (un body con otra → 403 y registro, regla dura 5);
 * la clave del proveedor nunca sale del servidor.
 * Los errores del proveedor se devuelven en lenguaje humano (`describeLibraryError`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { describeLibraryError, foreignOrganizationInBody, sanitizeAddLibraryInput } from '@/lib/services/crm/voiceLibrary';
import { addLibraryVoiceToCatalog, searchLibraryVoices } from '@/lib/services/crm/voiceLibraryService';
import { ElevenLabsError } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';

export const runtime = 'nodejs';

function fail(error: unknown) {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  if (error instanceof ElevenLabsError) {
    const status = error.status === 401 || error.status === 403 ? 502 : error.status < 500 ? 400 : 502;
    return NextResponse.json(
      { success: false, error: describeLibraryError(error), provider_code: error.code ?? null },
      { status }
    );
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error('[voices/library]', message);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const p = request.nextUrl.searchParams;
    const data = await searchLibraryVoices(ctx.organizationId, {
      search: p.get('search') ?? undefined,
      language: p.get('language') ?? undefined,
      gender: p.get('gender') ?? undefined,
      use_case: p.get('use_case') ?? undefined,
      page: Number(p.get('page') ?? 0),
    });
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body: unknown = await request.json().catch(() => null);
    // Regla dura 5: un body con otra organización → 403 y se registra (ronda 4: faltaba aquí).
    const bodyOrg = foreignOrganizationInBody((body as { organization_id?: unknown } | null)?.organization_id, ctx.organizationId);
    if (bodyOrg !== null) {
      console.warn('[voices/library] POST con organization_id ajeno en el body', { session: ctx.organizationId, body: bodyOrg });
      return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
    }
    // R13: identificadores con forma fija, nombre ≤120, descripción ≤500, idioma ISO o nada.
    const input = sanitizeAddLibraryInput(body);
    if (!input) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: voice_id, public_owner_id, name' },
        { status: 400 }
      );
    }
    const data = await addLibraryVoiceToCatalog(ctx.supabase, ctx.organizationId, input, ctx.userId);
    return NextResponse.json({ success: true, data }, { status: data.already_in_catalog ? 200 : 201 });
  } catch (error) {
    return fail(error);
  }
}
