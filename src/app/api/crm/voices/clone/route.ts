/**
 * POST /api/crm/voices/clone — clona la voz propia del dueño/vendedor.
 *
 * F-NEW-10 (ronda 2): `voiceCloneClient.createInstantClone` no tenía llamadores.
 * Desde la plataforma solo se podía importar el catálogo o teclear un `voice_id`
 * ajeno; CREAR la voz clonada no estaba escrito. Esta es la ruta que faltaba.
 *
 * Cuerpo: `multipart/form-data`
 *   name           (obligatorio)
 *   consent        'true' (obligatorio, D9 · Ley 1581 de 2012)
 *   samples        1..5 ficheros de audio, ≤10 MB cada uno
 *   description    opcional
 *   language       opcional (por defecto 'es')
 *   model_id       opcional (por defecto 'eleven_flash_v2_5')
 *   is_default     'true' opcional
 *
 * Seguridad: organización de la sesión, escritura solo para administradores.
 *
 * ⚠️ NO VERIFICADO EN VIVO: con la `ELEVENLABS_API_KEY` marcador de este entorno
 * el proveedor responde 401 y la ruta devuelve ese 401 tal cual, sin disimularlo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { cloneVoiceFromSample, MAX_VOICE_SAMPLES } from '@/lib/services/crm/voiceCatalogService';

export const runtime = 'nodejs';
/** Subir varias muestras de audio puede pasar de los 10 s por defecto. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);

    const form = await request.formData();
    const name = String(form.get('name') || '').trim();
    const consent = String(form.get('consent') || '') === 'true';
    const entries = form.getAll('samples').filter((f): f is File => f instanceof File);

    if (!name) {
      return NextResponse.json({ success: false, error: 'Falta el nombre de la voz' }, { status: 400 });
    }
    if (!consent) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Falta el consentimiento por escrito de la persona propietaria de la voz. ' +
            'No se puede clonar la voz de un tercero (Ley 1581 de 2012).',
        },
        { status: 400 }
      );
    }
    if (entries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Sube al menos una muestra de audio de la voz' },
        { status: 400 }
      );
    }
    if (entries.length > MAX_VOICE_SAMPLES) {
      return NextResponse.json(
        { success: false, error: `Como máximo ${MAX_VOICE_SAMPLES} muestras de audio` },
        { status: 400 }
      );
    }

    const result = await cloneVoiceFromSample(
      ctx.supabase,
      ctx.organizationId,
      {
        name,
        consentConfirmed: true,
        consentEvidence: { user_agent: request.headers.get('user-agent') ?? null },
        files: entries.map((f) => ({
          filename: f.name || 'muestra.mp3',
          type: f.type || '',
          size: f.size,
          blob: f,
        })),
        description: (form.get('description') as string | null)?.trim() || null,
        ownerUserId: ctx.userId,
        language: (form.get('language') as string | null) || undefined,
        modelId: (form.get('model_id') as string | null) || undefined,
        isDefault: String(form.get('is_default') || '') === 'true',
      },
      ctx.userId
    );

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    // El error del proveedor viaja con su propio status (401 con clave marcador).
    const providerStatus = (error as { status?: number })?.status;
    const isBusiness = /consentimiento|muestra|nombre|Formato|máximo|10 MB/i.test(message);
    console.error('[voices/clone]', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: providerStatus && providerStatus < 600 ? providerStatus : isBusiness ? 400 : 500 }
    );
  }
}
