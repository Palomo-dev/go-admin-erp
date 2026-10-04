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
import { readOrgBody } from '@/lib/security/organizationBody';
import { describeLibraryError, sanitizeAddLibraryInput } from '@/lib/services/crm/voiceLibrary';
import { addLibraryVoiceToCatalog, searchLibraryVoices } from '@/lib/services/crm/voiceLibraryService';
import { ElevenLabsError } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';
import { RequestDeadlineError, withRequestDeadline } from '@/lib/utils/requestDeadline';
import { CRM_READ_TRACE_HEADER, createCrmReadTrace, type CrmReadTrace } from '@/lib/utils/crmReadTrace';

export const runtime = 'nodejs';

function tracedResponse(response: NextResponse, trace: CrmReadTrace, code?: string) {
  trace.finish(response.status, code);
  response.headers.set(CRM_READ_TRACE_HEADER, trace.id);
  return response;
}

function fail(error: unknown, trace?: CrmReadTrace) {
  const finish = (response: NextResponse, code: string) => trace ? tracedResponse(response, trace, code) : response;
  if (error instanceof RequestDeadlineError) {
    return finish(NextResponse.json({ success: false, error: error.code === 'REQUEST_TIMEOUT'
      ? 'No se pudo completar la consulta de voces a tiempo. Vuelve a intentarlo.' : 'Petición cancelada.' }, { status: error.status }), error.code);
  }
  if (error instanceof OrgContextError) {
    return finish(NextResponse.json({ success: false, error: error.message }, { status: error.statusCode }), error.code);
  }
  if (error instanceof ElevenLabsError) {
    const status = error.status === 504 ? 504 : error.status === 503 ? 503 : error.status === 401 || error.status === 403 ? 502 : error.status < 500 ? 400 : 502;
    const code = ['credentials_unavailable', 'provider_timeout', 'provider_unavailable'].includes(error.code ?? '')
      ? error.code : 'PROVIDER_ERROR';
    return finish(NextResponse.json(
      { success: false, error: describeLibraryError(error), provider_code: error.code ?? null },
      { status }
    ), code ?? 'PROVIDER_ERROR');
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  if (!trace) console.error('[voices/library]', message);
  return finish(NextResponse.json({ success: false, error: message }, { status: 500 }), 'INTERNAL_ERROR');
}

export async function GET(request: NextRequest) {
  const trace = createCrmReadTrace('/api/crm/voices/library', request.headers.get(CRM_READ_TRACE_HEADER) ?? undefined);
  trace.step('handler-start');
  try {
    const data = await withRequestDeadline(async (signal) => {
      trace.step('context-start');
      const ctx = await getServerOrgContext(request, { signal });
      trace.step('context-end');
      const p = request.nextUrl.searchParams;
      trace.step('library-start');
      const library = await searchLibraryVoices(ctx.organizationId, {
        search: p.get('search') ?? undefined,
        language: p.get('language') ?? undefined,
        gender: p.get('gender') ?? undefined,
        use_case: p.get('use_case') ?? undefined,
        page: Number(p.get('page') ?? 0),
      }, signal);
      trace.step('library-end');
      return library;
    }, { timeoutMs: 18_000, signal: request.signal });
    return tracedResponse(NextResponse.json({ success: true, data }, { status: 200 }), trace);
  } catch (error) {
    return fail(error, trace);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body: unknown = readOrgBody(ctx, await request.json().catch(() => null), { request });
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
