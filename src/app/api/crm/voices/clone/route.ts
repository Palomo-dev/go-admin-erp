/**
 * POST /api/crm/voices/clone — clona la voz propia del dueño/vendedor.
 *
 * F-NEW-10 (ronda 2): `voiceCloneClient.createInstantClone` no tenía llamadores.
 * Desde la plataforma solo se podía importar el catálogo o teclear un `voice_id`
 * ajeno; CREAR la voz clonada no estaba escrito. Esta es la ruta que faltaba.
 *
 * Cuerpo: `multipart/form-data`
 *   name             (obligatorio, ≤ NAME_MAX)
 *   consent          'true' (obligatorio, D9 · Ley 1581 de 2012)
 *   consent_at       ISO opcional: momento en que se marcó la casilla en pantalla.
 *                    R9: solo se acepta si es reciente (24 h); si no, el reloj del servidor.
 *   samples          1..5 ficheros de audio, ≤10 MB cada uno
 *   duration_seconds opcional: duración reportada por el cliente. R9: el servidor
 *                    mide el audio recibido (WAV, WebM con Duration, MP3) y, si puede,
 *                    usa su medida; la evidencia declara `duration_source` y sella
 *                    `recorded_at` con su propio reloj. Ronda 3: si midió, aplica
 *                    MIN/MAX_SAMPLE_SECONDS antes de llamar al proveedor (400).
 *   description      opcional
 *   language         opcional (por defecto 'es')
 *   model_id         opcional (por defecto 'eleven_flash_v2_5')
 *   is_default       'true' opcional
 *
 * Seguridad: organización de la sesión, escritura solo para administradores.
 * Ronda 4 · orden de las comprobaciones, de la más barata a la más cara, para
 * que NADA se lea en memoria antes de saber que merece la pena:
 *   1. `content-length` > MAX_CLONE_REQUEST_BYTES → 400 sin tocar el cuerpo.
 *   2. `formData()`; `organization_id` ajeno → 403 y registro (regla dura 5).
 *   3. nombre (presente y ≤ NAME_MAX), consentimiento, número de muestras.
 *   4. `size` ≤ 10 MB y MIME admitido de CADA muestra, sin leerlas.
 *   5. solo entonces `measureSamples` (lee cada muestra una vez) y MIN/MAX.
 * Antes, `measureSamples` iba antes del filtro: 50 MB de `audio/wav` se leían
 * enteros (+44 MB de RSS) para acabar en 400.
 *
 * Historial: hasta 2026-09-14 esta ruta llevaba la marca «NO VERIFICADO EN VIVO»
 * (clave marcador, 401 del proveedor). Ese día se ejecutó contra la API real en
 * el rediseño UX de Voces. Cuando el plan de la cuenta no permite clonar, el
 * proveedor responde con `code` y aquí se traduce a lenguaje humano.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { cloneVoiceFromSample, isAllowedSampleMime, MAX_VOICE_SAMPLE_BYTES, MAX_VOICE_SAMPLES, MAX_CLONE_REQUEST_BYTES } from '@/lib/services/crm/voiceCatalogService';
import { buildConsentEvidence, measuredDurationError, NAME_MAX, sanitizeConsentAt } from '@/lib/services/crm/voiceCloneScript';
import { measureAudioDurationSeconds } from '@/lib/services/crm/audioDuration';
import { describeLibraryError } from '@/lib/services/crm/voiceLibrary';
import { ElevenLabsError } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';

export const runtime = 'nodejs';
/** Subir varias muestras de audio puede pasar de los 10 s por defecto. */
export const maxDuration = 60;


const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

/** Suma de las duraciones medidas en el servidor; `null` si alguna muestra no se pudo medir. */
async function measureSamples(files: File[]): Promise<number | null> {
  let total = 0;
  for (const f of files) {
    const seconds = measureAudioDurationSeconds(new Uint8Array(await f.arrayBuffer()), f.type);
    if (seconds === null) return null;
    total += seconds;
  }
  return Math.round(total * 10) / 10;
}

/** Primer problema de tamaño o formato entre las muestras, sin leer ninguna. */
function sampleProblem(files: File[]): string | null {
  for (const f of files) {
    if (f.size > MAX_VOICE_SAMPLE_BYTES) return `La muestra "${f.name}" supera los 10 MB`;
    if (!isAllowedSampleMime(f.type)) return `Formato de audio no admitido en "${f.name}": ${f.type}`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);

    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_CLONE_REQUEST_BYTES) {
      return bad(`La petición pesa demasiado: como máximo ${MAX_VOICE_SAMPLES} muestras de 10 MB cada una`);
    }

    const form = readOrgBody(ctx, await request.formData(), { request });
    const name = String(form.get('name') || '').trim();
    const consent = String(form.get('consent') || '') === 'true';
    const entries = form.getAll('samples').filter((f): f is File => f instanceof File);

    if (!name) return bad('Falta el nombre de la voz');
    if (name.length > NAME_MAX) return bad(`El nombre de la voz no puede pasar de ${NAME_MAX} caracteres`);
    if (!consent) {
      return bad(
        'Falta el consentimiento por escrito de la persona propietaria de la voz. ' +
          'No se puede clonar la voz de un tercero (Ley 1581 de 2012).'
      );
    }
    if (entries.length === 0) return bad('Sube al menos una muestra de audio de la voz');
    if (entries.length > MAX_VOICE_SAMPLES) return bad(`Como máximo ${MAX_VOICE_SAMPLES} muestras de audio`);
    const problem = sampleProblem(entries);
    if (problem) return bad(problem);

    const nowMs = Date.now();
    const consentAt = sanitizeConsentAt(String(form.get('consent_at') || ''), nowMs);
    const measured = await measureSamples(entries);
    const durationProblem = measuredDurationError(measured);
    if (durationProblem) return bad(durationProblem);

    const durationRaw = Number(form.get('duration_seconds') || 0);
    const clientDuration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw * 10) / 10 : 0;
    const consentEvidence = buildConsentEvidence({
      acceptedAt: consentAt,
      recordedAt: new Date(nowMs).toISOString(),
      userId: ctx.userId,
      sample: {
        // C02: si el servidor midió, manda su medida; la del cliente solo cuando no pudo.
        durationSeconds: measured ?? clientDuration,
        bytes: entries.reduce((acc, f) => acc + f.size, 0),
        mimeType: entries[0].type || 'application/octet-stream',
      },
      durationSource: measured !== null ? 'server_measured' : 'client_reported',
      userAgent: request.headers.get('user-agent'),
    });

    const result = await cloneVoiceFromSample(
      ctx.supabase,
      ctx.organizationId,
      {
        name,
        consentConfirmed: true,
        consentEvidence,
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
    if (error instanceof ElevenLabsError) {
      console.error('[voices/clone] proveedor', error.status, error.code ?? '', error.message);
      return NextResponse.json(
        { success: false, error: describeLibraryError(error), provider_code: error.code ?? null },
        { status: error.status === 401 || error.status === 403 ? 502 : error.status < 500 ? 400 : 502 }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    const providerStatus = (error as { status?: number })?.status;
    const isBusiness = /consentimiento|muestra|nombre|Formato|máximo|10 MB/i.test(message);
    console.error('[voices/clone]', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: providerStatus && providerStatus < 600 ? providerStatus : isBusiness ? 400 : 500 }
    );
  }
}
