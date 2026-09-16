import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { getProviderCredentials } from '@/lib/services/providerCredentials.server';
import { textoDecible } from '@/lib/ai/assistant/tts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai-assistant/tts — la respuesta del asistente, en audio (R2, §5.5.1).
 *
 * Solo si la organización activó `ai_assistant_settings.tts_enabled`: la voz
 * cuesta créditos y no todas las organizaciones la quieren. La voz sale de
 * `tts_voice_id`, si no de la voz por defecto de la organización (`voices`,
 * la misma que usa el CRM para llamadas), si no de una voz neutra en español.
 *
 * Es la parte de F5 que no depende del `ws-server`: "audio entra y sale". La
 * voz en vivo (`/assistant-voice` por WebSocket) queda tras `voice_enabled`.
 */

const DEFAULT_VOICE_ID = 'CaJslL1xziwefCeTNzHv'; // español neutro (misma que el preview de consentimiento)
const TTS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
/** Créditos por cada 500 caracteres, mínimo 1. */
const CHARS_PER_CREDIT = 500;

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const rl = await checkRateLimit(`assistant:tts:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas lecturas seguidas. Espera un momento.', code: 'RATE_LIMITED' }, { status: 429 });
  }

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 });
  }
  try {
    readOrgBody(ctx, body, { request });
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    throw err;
  }
  const text = typeof body.text === 'string' ? textoDecible(body.text) : '';
  if (!text) return NextResponse.json({ error: 'No hay texto que leer.' }, { status: 400 });

  const { data: settings } = await ctx.supabase
    .from('ai_assistant_settings')
    .select('tts_enabled, tts_voice_id')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  const cfg = settings as { tts_enabled: boolean; tts_voice_id: string | null } | null;
  if (!cfg?.tts_enabled) {
    return NextResponse.json(
      { error: 'La respuesta en audio no está activada para esta organización.', code: 'TTS_DISABLED' },
      { status: 403 }
    );
  }

  const creds = await getProviderCredentials(ctx.organizationId, 'tts', 'elevenlabs').catch(() => null);
  const apiKey = creds?.credentials?.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({ error: 'Sin proveedor de voz configurado.', code: 'TTS_NOT_CONFIGURED' }, { status: 501 });
  }

  let voiceId = cfg.tts_voice_id?.trim() || '';
  if (!voiceId) {
    const { data: voz } = await ctx.supabase
      .from('voices')
      .select('provider_voice_id')
      .eq('organization_id', ctx.organizationId)
      .eq('provider', 'elevenlabs')
      .eq('is_active', true)
      .eq('is_default', true)
      .maybeSingle();
    voiceId = (voz as { provider_voice_id: string } | null)?.provider_voice_id || DEFAULT_VOICE_ID;
  }
  // El id de voz va en la URL: que no pueda salirse del segmento.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(voiceId)) voiceId = DEFAULT_VOICE_ID;

  const balance = await checkAICredits(ctx.organizationId);
  if (!balance.allowed) {
    return NextResponse.json({ error: balance.error || 'Créditos de IA insuficientes.', code: 'NO_CREDITS' }, { status: 402 });
  }

  let audio: Buffer;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: TTS_MODEL, language_code: 'es' }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[GO Assistant] TTS', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: `El proveedor de voz respondió ${res.status}.`, code: 'TTS_FAILED' }, { status: 502 });
    }
    audio = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error('[GO Assistant] TTS error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo generar el audio.', code: 'TTS_FAILED' }, { status: 502 });
  }

  // Cobro DESPUÉS de tener el audio (§2.8).
  const credits = Math.max(1, Math.ceil(text.length / CHARS_PER_CREDIT));
  try {
    await chargeAiCredits({
      orgId: ctx.organizationId,
      actionType: 'assistant_tts',
      model: `elevenlabs:${TTS_MODEL}`,
      units: text.length,
      credits,
      userId: ctx.userId,
      metadata: { chars: text.length, voice_id: voiceId, surface: 'header_assistant' },
    });
  } catch (chargeError) {
    console.warn('[GO Assistant] No se pudo cobrar el TTS:', chargeError instanceof Error ? chargeError.message : chargeError);
  }

  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, no-store',
      'Content-Length': String(audio.length),
      'X-AI-Credits': String(credits),
    },
  });
}
