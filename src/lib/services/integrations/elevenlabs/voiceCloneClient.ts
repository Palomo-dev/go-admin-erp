/**
 * Cliente REST de ElevenLabs para el catálogo de voces del agente IA (FASE 06).
 *
 * Base https://api.elevenlabs.io/v1/ · header `xi-api-key`.
 *
 * Historial de verificación:
 *  - Hasta 2026-09-14 el archivo llevaba la marca «NO VERIFICADO EN VIVO»: la
 *    clave del entorno era el marcador de `.env.example` y todo respondía 401.
 *  - 2026-09-14 (rediseño UX de Voces): con clave real se ejecutaron contra la
 *    API `GET /shared-voices`, `POST /voices/add/{owner}/{id}`, `GET /voices/{id}`,
 *    `DELETE /voices/{id}`, `GET /voices` y `POST /voices/add` (IVC). Lo que la
 *    cuenta no permite (plan gratuito) se traduce a un mensaje humano en
 *    `voiceLibrary.describeLibraryError`, nunca se disimula.
 */

import type { SharedVoiceRaw } from '@/lib/services/crm/voiceLibrary';

const BASE_URL = 'https://api.elevenlabs.io/v1';

export class ElevenLabsError extends Error {
  readonly status: number;
  /** `detail.status` (o `detail.code`) del proveedor: `can_not_use_instant_voice_cloning`, `free_users_not_allowed`… */
  readonly code: string | undefined;
  readonly detail: unknown;
  constructor(status: number, message: string, detail?: unknown, code?: string) {
    super(message);
    this.name = 'ElevenLabsError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Marcadores de `.env.example` que NO son credenciales reales. */
export function isPlaceholderKey(key: string | null | undefined): boolean {
  if (!key) return true;
  const k = key.trim();
  if (k.length < 24) return true;
  return /^(your-|<|xxx|placeholder|tu-|change|replace)/i.test(k);
}

export interface ElevenLabsVoiceSummary {
  voice_id: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  preview_url: string | null;
}

export interface SharedVoicesPage {
  voices: SharedVoiceRaw[];
  has_more: boolean;
  total_count: number;
}

/** Lo que consumimos de `GET /v1/user/subscription` (verificado en vivo el 2026-09-14, plan `free`). */
export interface ElevenLabsSubscription {
  tier: string;
  can_use_instant_voice_cloning: boolean;
  character_count: number;
  character_limit: number;
}

interface ElevenLabsClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface ProviderDetail {
  detail?: { message?: string; code?: string; status?: string } | string;
}

export class ElevenLabsVoiceClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ElevenLabsClientOptions) {
    if (isPlaceholderKey(options.apiKey)) {
      throw new ElevenLabsError(
        401,
        'La ELEVENLABS_API_KEY configurada es un marcador de ejemplo, no una clave real'
      );
    }
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'xi-api-key': this.apiKey, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const text = await res.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* texto plano */
      }
      const detail = (payload as ProviderDetail | null)?.detail;
      const d = typeof detail === 'object' && detail ? detail : undefined;
      const message = d?.message || (typeof detail === 'string' ? detail : '') || `ElevenLabs ${res.status}`;
      // `detail.status` es más específico que `detail.code` (p. ej. code
      // `paid_plan_required` con status `can_not_use_instant_voice_cloning`).
      throw new ElevenLabsError(res.status, message, payload, d?.status || d?.code);
    }
    return res;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.raw(path, init);
    const text = await res.text();
    try {
      return (text ? JSON.parse(text) : null) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /** GET /v1/voices — catálogo del workspace (incluye las voces clonadas y las añadidas). */
  async listVoices(): Promise<ElevenLabsVoiceSummary[]> {
    const data = await this.request<{ voices?: ElevenLabsVoiceSummary[] }>('/voices');
    return data.voices ?? [];
  }

  /** GET /v1/voices/{id} — una voz del workspace. */
  async getVoice(voiceId: string): Promise<ElevenLabsVoiceSummary> {
    return this.request<ElevenLabsVoiceSummary>(`/voices/${encodeURIComponent(voiceId)}`);
  }

  /** GET /v1/shared-voices — biblioteca pública. `query` ya viene saneada. */
  async listSharedVoices(query: URLSearchParams): Promise<SharedVoicesPage> {
    const data = await this.request<Partial<SharedVoicesPage>>(`/shared-voices?${query.toString()}`);
    return {
      voices: data.voices ?? [],
      has_more: data.has_more === true,
      total_count: typeof data.total_count === 'number' ? data.total_count : 0,
    };
  }

  /**
   * POST /v1/voices/add/{public_owner_id}/{voice_id} — copia una voz de la
   * biblioteca al workspace (necesario para poder sintetizar con ella).
   */
  async addSharedVoice(publicOwnerId: string, voiceId: string, newName: string): Promise<{ voice_id: string }> {
    return this.request<{ voice_id: string }>(
      `/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ new_name: newName }),
      }
    );
  }

  /** DELETE /v1/voices/{id} — libera el hueco del workspace. */
  async deleteVoice(voiceId: string): Promise<void> {
    await this.request(`/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE' });
  }

  /** GET /v1/user — comprobación de credencial. */
  async ping(): Promise<{ ok: true }> {
    await this.request('/user');
    return { ok: true };
  }

  /** GET /v1/user/subscription — plan de la cuenta (solo lectura; no gasta créditos). */
  async getSubscription(): Promise<ElevenLabsSubscription> {
    const data = await this.request<Partial<ElevenLabsSubscription>>('/user/subscription');
    return {
      tier: typeof data.tier === 'string' ? data.tier : 'unknown',
      can_use_instant_voice_cloning: data.can_use_instant_voice_cloning === true,
      character_count: typeof data.character_count === 'number' ? data.character_count : 0,
      character_limit: typeof data.character_limit === 'number' ? data.character_limit : 0,
    };
  }

  /** POST /v1/text-to-speech/{id} — audio MP3 de una frase corta (para «Escuchar»). */
  async synthesize(voiceId: string, text: string, modelId = 'eleven_flash_v2_5'): Promise<ArrayBuffer> {
    const res = await this.raw(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: modelId }),
    });
    return res.arrayBuffer();
  }

  /**
   * POST /v1/voices/add (multipart) — Instant Voice Cloning.
   * D9: solo se clona la voz propia del vendedor/dueño, con consentimiento registrado.
   */
  async createInstantClone(params: {
    name: string;
    files: Array<{ filename: string; blob: Blob }>;
    description?: string;
    removeBackgroundNoise?: boolean;
    labels?: Record<string, string>;
  }): Promise<{ voice_id: string; requires_verification?: boolean }> {
    if (params.files.length === 0) throw new ElevenLabsError(400, 'Se requiere al menos una muestra de audio');
    const form = new FormData();
    form.append('name', params.name);
    if (params.description) form.append('description', params.description);
    if (params.removeBackgroundNoise !== undefined) {
      form.append('remove_background_noise', String(params.removeBackgroundNoise));
    }
    if (params.labels) form.append('labels', JSON.stringify(params.labels));
    for (const f of params.files) form.append('files', f.blob, f.filename);

    return this.request<{ voice_id: string; requires_verification?: boolean }>('/voices/add', {
      method: 'POST',
      body: form,
    });
  }
}

/** Crea el cliente desde el registro de proveedores (org) con fallback a env. */
export async function getElevenLabsClientForOrg(orgId: number): Promise<ElevenLabsVoiceClient> {
  const { getProviderCredentials } = await import('@/lib/services/providerCredentials.server');
  const cfg = await getProviderCredentials(orgId, 'tts', 'elevenlabs');
  const key = cfg.credentials.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || '';
  return new ElevenLabsVoiceClient({ apiKey: key });
}
