/**
 * GET /api/crm/voices/{id}/preview — «Escuchar» una voz del catálogo.
 *
 * Si el proveedor tiene previsualización pública, redirige a ella. Si no (una
 * voz recién clonada), sintetiza una frase corta y devuelve el MP3. Nunca sale
 * la clave del proveedor: la síntesis ocurre aquí, en el servidor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { previewCatalogVoice } from '@/lib/services/crm/voiceLibraryService';
import { describeLibraryError } from '@/lib/services/crm/voiceLibrary';
import { ElevenLabsError } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await context.params;
    if (!id) return NextResponse.json({ success: false, error: 'Falta id' }, { status: 400 });
    const preview = await previewCatalogVoice(ctx.supabase, ctx.organizationId, id);
    if (preview.kind === 'url') return NextResponse.redirect(preview.url, 302);
    return new NextResponse(preview.audio, {
      status: 200,
      headers: { 'content-type': preview.contentType, 'cache-control': 'private, max-age=600' },
    });
  } catch (error) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ success: false, error: describeLibraryError(error) }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[voices/preview]', message);
    return NextResponse.json({ success: false, error: message }, { status: /no existe/i.test(message) ? 404 : 500 });
  }
}
