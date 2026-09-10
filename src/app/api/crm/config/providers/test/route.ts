/**
 * POST /api/crm/config/providers/test — prueba real de conexión por categoría.
 *
 * Sesión + admin. Resuelve credenciales con `getProviderCredentials` (org →
 * env) y ejecuta la llamada más barata de cada SDK (verificadas en
 * node_modules el 2026-09-08):
 *   twilio     client.api.v2010.accounts(sid).fetch()
 *   resend     resend.domains.list()
 *   elevenlabs client.user.subscription.get()
 *   openai     client.models.list()
 *   google     new GoogleGenAI({apiKey}).models.list()
 *   meta       GET graph/v22.0/{phone_number_id}?fields=display_phone_number
 * Devuelve { ok, latencyMs, detail } (detalle saneado, sin secretos).
 * Rate limit: 5/min/org (en memoria por instancia).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { PROVIDER_CATEGORIES, type ProviderCategory } from '@/lib/crm/providerCatalog';
import { getProviderCredentials } from '@/lib/services/providerCredentials.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const bodySchema = z.object({
  category: z.enum(PROVIDER_CATEGORIES as [ProviderCategory, ...ProviderCategory[]]),
  provider: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/).optional(),
});

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<number, number[]>();

function rateLimited(orgId: number): boolean {
  const now = Date.now();
  const arr = (hits.get(orgId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(orgId, arr);
    return true;
  }
  arr.push(now);
  hits.set(orgId, arr);
  return false;
}

function sanitize(msg: string, secrets: string[]): string {
  let out = msg.slice(0, 300);
  for (const s of secrets) if (s && s.length > 6) out = out.split(s).join('••••');
  return out;
}

type TestResult = { ok: boolean; detail: string };

async function runTest(provider: string, creds: Record<string, string>): Promise<TestResult> {
  switch (provider) {
    case 'twilio': {
      const sid = creds.TWILIO_ACCOUNT_SID;
      const token = creds.TWILIO_AUTH_TOKEN;
      const apiKey = creds.TWILIO_API_KEY;
      const apiSecret = creds.TWILIO_API_SECRET;
      if (!sid || (!token && !(apiKey && apiSecret))) return { ok: false, detail: 'Faltan TWILIO_ACCOUNT_SID y token o API Key/Secret' };
      const twilio = (await import('twilio')).default;
      const client = apiKey && apiSecret ? twilio(apiKey, apiSecret, { accountSid: sid }) : twilio(sid, token);
      const acc = await client.api.v2010.accounts(sid).fetch();
      return { ok: true, detail: `Cuenta ${acc.friendlyName ?? sid} (${acc.status})` };
    }
    case 'resend': {
      if (!creds.RESEND_API_KEY) return { ok: false, detail: 'Falta RESEND_API_KEY' };
      const { Resend } = await import('resend');
      const resend = new Resend(creds.RESEND_API_KEY);
      const { data, error } = await resend.domains.list();
      if (error) return { ok: false, detail: error.message };
      const n = data?.data?.length ?? 0;
      return { ok: true, detail: `${n} dominio(s) en la cuenta` };
    }
    case 'elevenlabs': {
      if (!creds.ELEVENLABS_API_KEY) return { ok: false, detail: 'Falta ELEVENLABS_API_KEY' };
      const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js');
      const client = new ElevenLabsClient({ apiKey: creds.ELEVENLABS_API_KEY });
      const sub = await client.user.subscription.get();
      const used = sub.characterCount ?? 0;
      const limit = sub.characterLimit ?? 0;
      return { ok: true, detail: `Plan ${sub.tier ?? 'n/a'}: ${used}/${limit} caracteres` };
    }
    case 'openai': {
      if (!creds.OPENAI_API_KEY) return { ok: false, detail: 'Falta OPENAI_API_KEY' };
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({ apiKey: creds.OPENAI_API_KEY });
      const page = await client.models.list();
      const count = page.data?.length ?? 0;
      return { ok: true, detail: `${count} modelo(s) disponibles` };
    }
    case 'google': {
      if (!creds.GOOGLE_AI_API_KEY) return { ok: false, detail: 'Falta GOOGLE_AI_API_KEY' };
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: creds.GOOGLE_AI_API_KEY });
      const pager = await ai.models.list({ config: { pageSize: 5 } });
      let n = 0;
      for await (const model of pager) {
        if (model) n += 1;
        if (n >= 5) break;
      }
      return { ok: true, detail: `${n}+ modelo(s) visibles` };
    }
    case 'meta': {
      const token = creds.META_ACCESS_TOKEN;
      const phoneId = creds.META_PHONE_NUMBER_ID;
      if (!token || !phoneId) return { ok: false, detail: 'Faltan META_ACCESS_TOKEN / META_PHONE_NUMBER_ID' };
      const res = await fetch(
        `https://graph.facebook.com/v22.0/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
      );
      const json = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
      if (!res.ok) return { ok: false, detail: json.error?.message ?? `HTTP ${res.status}` };
      return { ok: true, detail: `${json.verified_name ?? ''} ${json.display_phone_number ?? ''}`.trim() || 'Número verificado' };
    }
    case 'deepgram': {
      if (!creds.DEEPGRAM_API_KEY) return { ok: false, detail: 'Falta DEEPGRAM_API_KEY' };
      const res = await fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${creds.DEEPGRAM_API_KEY}` }, cache: 'no-store' });
      return res.ok ? { ok: true, detail: 'Clave válida (legacy; se retira en F4)' } : { ok: false, detail: `HTTP ${res.status}` };
    }
    case 'internal':
      return { ok: true, detail: 'Calendario interno: no requiere conexión' };
    default:
      return { ok: false, detail: `Prueba no disponible para '${provider}'` };
  }
}

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ ok: false, detail: err.message }, { status: err.statusCode });
    }
    throw err;
  }
  if (!isOrgAdmin(ctx)) {
    return NextResponse.json({ ok: false, detail: 'Solo administradores' }, { status: 403 });
  }
  if (rateLimited(ctx.organizationId)) {
    return NextResponse.json({ ok: false, detail: 'Demasiadas pruebas; espera un minuto' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, detail: 'Body inválido' }, { status: 400 });
  }

  const cfg = await getProviderCredentials(ctx.organizationId, parsed.data.category, parsed.data.provider);
  if (!cfg.isActive || cfg.provider === 'none') {
    return NextResponse.json({ ok: false, provider: cfg.provider, source: cfg.source, detail: 'Sin credenciales configuradas (ni propias ni de la plataforma)' }, { status: 200 });
  }

  const secrets = Object.values(cfg.credentials);
  const started = Date.now();
  try {
    const result = await runTest(cfg.provider, cfg.credentials);
    return NextResponse.json(
      { ...result, provider: cfg.provider, source: cfg.source, latencyMs: Date.now() - started, detail: sanitize(result.detail, secrets) },
      { status: result.ok ? 200 : 502 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json(
      { ok: false, provider: cfg.provider, source: cfg.source, latencyMs: Date.now() - started, detail: sanitize(msg, secrets) },
      { status: 502 },
    );
  }
}
