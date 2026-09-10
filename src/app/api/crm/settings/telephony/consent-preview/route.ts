import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getProviderCredentials } from '@/lib/services/providerCredentials.server';
import { checkRateLimits } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  text: z.string().trim().min(5).max(500),
  /** Voz de Twilio (Polly.*) — solo informativa: el preview usa ElevenLabs. */
  voice: z.string().max(60).optional(),
  language: z.enum(['es-MX', 'es-US', 'es-ES']).optional(),
});

/** Voces ElevenLabs por defecto para español (docs-elevenlabs / docs-twilio-voice). */
const ELEVEN_VOICES: Record<string, string> = {
  'es-MX': 'CaJslL1xziwefCeTNzHv',
  'es-US': 'CaJslL1xziwefCeTNzHv',
  'es-ES': '6xftrpatV0jGmFHxDjUv',
};

/**
 * POST /api/crm/settings/telephony/consent-preview — audio/mpeg del mensaje
 * de consentimiento (FASE-03 §4.1). Polly (Twilio <Say>) no es descargable, así
 * que el preview usa ElevenLabs `eleven_flash_v2_5` con la key del registry
 * (`tts`, fallback env ELEVENLABS_API_KEY). Sin key → 501 y el cliente cae a
 * Web Speech API. Rate limit 10/min por usuario.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    throw err;
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Body inválido', issues: parsed.error.issues }, { status: 400 });

  const rl = await checkRateLimits([{ key: `consent-preview:${ctx.userId}`, opts: { limit: 10, windowMs: 60_000 } }]);
  if (!rl.allowed) return NextResponse.json({ success: false, error: 'Demasiadas previsualizaciones, espera un minuto' }, { status: 429 });

  const creds = await getProviderCredentials(ctx.organizationId, 'tts', 'elevenlabs').catch(() => null);
  const apiKey = creds?.credentials?.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Sin proveedor de TTS para previsualizar', code: 'TTS_NOT_CONFIGURED' }, { status: 501 });
  }

  const voiceId = ELEVEN_VOICES[parsed.data.language ?? 'es-MX'];
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: parsed.data.text, model_id: 'eleven_flash_v2_5', language_code: 'es' }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[consent-preview] ElevenLabs', res.status, detail.slice(0, 200));
      return NextResponse.json({ success: false, error: `El proveedor de voz respondió ${res.status}` }, { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'Content-Length': String(buf.length) } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[consent-preview] error:', message);
    return NextResponse.json({ success: false, error: 'No se pudo generar el audio' }, { status: 502 });
  }
}
