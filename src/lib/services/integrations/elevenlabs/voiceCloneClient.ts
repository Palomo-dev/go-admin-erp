/**
 * Cliente REST de ElevenLabs para el catálogo de voces del agente IA (FASE 06).
 *
 * Base https://api.elevenlabs.io/v1/ · header `xi-api-key` (docs-elevenlabs.md).
 *
 * ⚠️ NO VERIFICADO EN VIVO: la `ELEVENLABS_API_KEY` de este entorno es el marcador
 * literal de `.env.example` y la API responde 401 en `/v1/user` y `/v1/voices`.
 * El camino está escrito completo y con los nombres de parámetro de la documentación,
 * pero NO se ha podido ejecutar contra el proveedor real. Cualquier afirmación sobre
 * su funcionamiento en producción sería falsa hasta que exista una clave válida.
 */

const BASE_URL = 'https://api.elevenlabs.io/v1';

export class ElevenLabsError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ElevenLabsError';
    this.status = status;
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

interface ElevenLabsClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'xi-api-key': this.apiKey, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!res.ok) {
      const detail = (payload as { detail?: { message?: string } } | null)?.detail;
      throw new ElevenLabsError(res.status, detail?.message || `ElevenLabs ${res.status}`, payload);
    }
    return payload as T;
  }

  /** GET /v1/voices — catálogo del workspace (incluye las voces clonadas). */
  async listVoices(): Promise<ElevenLabsVoiceSummary[]> {
    const data = await this.request<{ voices?: ElevenLabsVoiceSummary[] }>('/voices');
    return data.voices ?? [];
  }

  /** GET /v1/user — comprobación de credencial. */
  async ping(): Promise<{ ok: true }> {
    await this.request('/user');
    return { ok: true };
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
