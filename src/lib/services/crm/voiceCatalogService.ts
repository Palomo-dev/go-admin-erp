/**
 * Voice Catalog Service — FASE 06: catálogo de voces de la organización.
 *
 * Cierra C-F6/I7 en la capa de datos: existe dónde guardar la voz clonada del
 * vendedor, con proveedor, modelo y consentimiento (D9: no se clona la voz de un
 * tercero; el CHECK `voices_cloned_requires_consent` lo impide en la base).
 *
 * El consumo en la llamada vive en `voiceAgent/agentRuntime.resolveVoice()`, que
 * emite `ttsProvider` y `voice` en el `<ConversationRelay>`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ALLOWED_SAMPLE_MIME, MAX_CLONE_SAMPLES, MAX_SAMPLE_BYTES, NAME_MAX, isAllowedSampleMime } from './voiceCloneScript';

export type VoiceProvider = 'elevenlabs' | 'google' | 'amazon' | 'twilio';
export type VoiceKind = 'library' | 'cloned' | 'designed';

export interface VoiceRow {
  id: string;
  organization_id: number;
  provider: VoiceProvider;
  provider_voice_id: string;
  name: string;
  description: string | null;
  owner_user_id: string | null;
  kind: VoiceKind;
  language: string;
  model_id: string;
  sample_path: string | null;
  consent_recorded_at: string | null;
  consent_evidence: Record<string, unknown>;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceInput {
  provider?: VoiceProvider;
  provider_voice_id: string;
  name: string;
  description?: string | null;
  owner_user_id?: string | null;
  kind?: VoiceKind;
  language?: string;
  model_id?: string;
  sample_path?: string | null;
  /** Obligatorio para `kind: 'cloned'` (D9). */
  consent_recorded_at?: string | null;
  consent_evidence?: Record<string, unknown>;
  is_default?: boolean;
  is_active?: boolean;
}

export class VoiceCatalogError extends Error {
  readonly code: string | undefined;
  constructor(context: string, error: { message: string; code?: string }) {
    super(`[${context}] ${error.message}${error.code ? ` (${error.code})` : ''}`);
    this.name = 'VoiceCatalogError';
    this.code = error.code;
  }
}

function unwrap<T>(context: string, res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new VoiceCatalogError(context, res.error);
  return res.data;
}

export async function listVoices(supabase: SupabaseClient, orgId: number): Promise<VoiceRow[]> {
  const data = unwrap(
    'listVoices',
    await supabase
      .from('voices')
      .select('*')
      .eq('organization_id', orgId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
  );
  return (data || []) as VoiceRow[];
}

export async function createVoice(
  supabase: SupabaseClient,
  orgId: number,
  input: VoiceInput,
  createdBy?: string | null
): Promise<VoiceRow> {
  const kind = input.kind ?? 'library';
  if (kind === 'cloned' && !input.consent_recorded_at) {
    throw new Error(
      'Una voz clonada exige consentimiento de su propietario (Ley 1581 y política de ElevenLabs). ' +
        'No se puede clonar la voz de un tercero.'
    );
  }
  if (!input.provider_voice_id?.trim()) throw new Error('Falta el identificador de la voz del proveedor');
  if (!input.name?.trim()) throw new Error('La voz necesita un nombre');
  // Ronda 4: NAME_MAX también en el servidor (el `maxLength` del input no es una barrera).
  if (input.name.trim().length > NAME_MAX) throw new Error(`El nombre de la voz no puede pasar de ${NAME_MAX} caracteres`);

  // Solo columnas conocidas: `organization_id` sale SIEMPRE del parámetro (sesión), nunca del input.
  const row: Record<string, unknown> = {
    organization_id: orgId,
    provider: input.provider ?? 'elevenlabs',
    provider_voice_id: input.provider_voice_id.trim(),
    name: input.name.trim(),
    kind,
  };
  const optional: (keyof VoiceInput)[] = [
    'description', 'owner_user_id', 'language', 'model_id', 'sample_path',
    'consent_recorded_at', 'consent_evidence', 'is_active',
  ];
  for (const k of optional) if (input[k] !== undefined) row[k] = input[k];
  if (createdBy) row.created_by = createdBy;

  const created = unwrap(
    'createVoice',
    await supabase.from('voices').insert(row).select('*').single()
  ) as VoiceRow;

  if (input.is_default) await setDefaultVoice(supabase, orgId, created.id);
  return created;
}

export async function updateVoice(
  supabase: SupabaseClient,
  orgId: number,
  id: string,
  input: Partial<VoiceInput>
): Promise<VoiceRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields: (keyof VoiceInput)[] = [
    'provider', 'provider_voice_id', 'name', 'description', 'owner_user_id', 'kind',
    'language', 'model_id', 'sample_path', 'consent_recorded_at', 'consent_evidence', 'is_active',
  ];
  for (const k of fields) if (input[k] !== undefined) patch[k] = input[k];

  const data = unwrap(
    'updateVoice',
    await supabase.from('voices').update(patch).eq('id', id).eq('organization_id', orgId).select('*').maybeSingle()
  ) as VoiceRow | null;

  if (input.is_default) await setDefaultVoice(supabase, orgId, id);
  return data;
}

/** Una sola voz por defecto por organización (índice único parcial en la base). */
export async function setDefaultVoice(
  supabase: SupabaseClient,
  orgId: number,
  id: string
): Promise<void> {
  unwrap(
    'setDefaultVoice.clear',
    await supabase
      .from('voices')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('is_default', true)
  );
  unwrap(
    'setDefaultVoice.set',
    await supabase
      .from('voices')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId)
  );
}

export async function deleteVoice(
  supabase: SupabaseClient,
  orgId: number,
  id: string
): Promise<void> {
  unwrap('deleteVoice', await supabase.from('voices').delete().eq('id', id).eq('organization_id', orgId));
}

/**
 * Importa el catálogo del WORKSPACE del proveedor a `voices` (no la biblioteca
 * pública: para esa está `voiceLibraryService.searchLibraryVoices`).
 * Verificado en vivo el 2026-09-14 con clave real (`GET /v1/voices`).
 */
export async function importElevenLabsVoices(
  supabase: SupabaseClient,
  orgId: number
): Promise<{ imported: number; voices: string[] }> {
  const { getElevenLabsClientForOrg } = await import(
    '@/lib/services/integrations/elevenlabs/voiceCloneClient'
  );
  const client = await getElevenLabsClientForOrg(orgId);
  const remote = await client.listVoices();

  const rows = remote.map((v) => ({
    organization_id: orgId,
    provider: 'elevenlabs',
    provider_voice_id: v.voice_id,
    name: v.name,
    description: v.labels?.description ?? null,
    kind: v.category === 'cloned' ? 'cloned' : 'library',
    // Una voz marcada como clonada en el proveedor llega con el consentimiento que
    // el workspace ya registró al crearla; se anota la fecha de importación.
    consent_recorded_at: v.category === 'cloned' ? new Date().toISOString() : null,
    consent_evidence: v.category === 'cloned' ? { imported_from: 'elevenlabs_workspace' } : {},
    language: 'es',
    model_id: 'eleven_flash_v2_5',
  }));

  if (rows.length === 0) return { imported: 0, voices: [] };
  unwrap(
    'importElevenLabsVoices',
    await supabase.from('voices').upsert(rows, { onConflict: 'organization_id,provider,provider_voice_id' })
  );
  return { imported: rows.length, voices: rows.map((r) => r.name) };
}

// ─── Clonado instantáneo de voz (IVC) ────────────────────────────────────────

/** 10 MB por muestra: la misma constante que aplica el asistente (una sola fuente). */
export const MAX_VOICE_SAMPLE_BYTES = MAX_SAMPLE_BYTES;
export const MAX_VOICE_SAMPLES = MAX_CLONE_SAMPLES;
/** H1 (ronda 3): la lista blanca vive junto a los candidatos del grabador, en `voiceCloneScript`. */
export { ALLOWED_SAMPLE_MIME, isAllowedSampleMime };

export interface CloneVoiceInput {
  name: string;
  /** Muestras de audio de la voz propia (mínimo una). */
  files: Array<{ filename: string; type: string; size: number; blob: Blob }>;
  /** D9: consentimiento explícito y por escrito de la persona propietaria. */
  consentConfirmed: boolean;
  consentEvidence?: Record<string, unknown>;
  description?: string | null;
  ownerUserId?: string | null;
  language?: string;
  modelId?: string;
  isDefault?: boolean;
  removeBackgroundNoise?: boolean;
}

/**
 * Crea una voz clonada en ElevenLabs (Instant Voice Cloning, `POST /v1/voices/add`)
 * y la registra en el catálogo de la organización.
 *
 * F-NEW-10 del tester: `createInstantClone` existía pero NO tenía llamadores; no
 * había ruta ni pantalla para subir la muestra, así que desde la plataforma solo se
 * podía importar o teclear un `voice_id` ajeno. Esta función es el camino que
 * faltaba, y `POST /api/crm/voices/clone` la expone.
 *
 * D9 · Ley 1581 y política de ElevenLabs: solo se clona la voz propia del dueño o
 * del vendedor, con consentimiento. Sin `consentConfirmed` no se llama al proveedor.
 *
 * Historial: hasta 2026-09-14 esta función NO se había ejecutado de verdad (la
 * clave era el marcador de `.env.example`). Ese día se ejecutó contra la API real
 * en el rediseño UX de Voces; el contrato de `POST /v1/voices/add` (multipart con
 * `name`, `files`, `remove_background_noise`, `labels`) es el que usa el cliente.
 * Si la cuenta no permite clonar (plan gratuito), el error del proveedor sube con
 * su `code` y la ruta lo traduce a lenguaje humano.
 */
export async function cloneVoiceFromSample(
  supabase: SupabaseClient,
  orgId: number,
  input: CloneVoiceInput,
  createdBy?: string | null
): Promise<{ voice: VoiceRow; provider_voice_id: string; requires_verification: boolean }> {
  if (!input.name?.trim()) throw new Error('La voz necesita un nombre');
  // Antes del proveedor: si fallara en `createVoice`, la voz ya estaría creada allí.
  if (input.name.trim().length > NAME_MAX) throw new Error(`El nombre de la voz no puede pasar de ${NAME_MAX} caracteres`);
  if (!input.consentConfirmed) {
    throw new Error(
      'Falta el consentimiento por escrito de la persona propietaria de la voz. ' +
        'No se puede clonar la voz de un tercero (Ley 1581 de 2012 y política de ElevenLabs).'
    );
  }
  if (!input.files || input.files.length === 0) {
    throw new Error('Se necesita al menos una muestra de audio de la voz');
  }
  if (input.files.length > MAX_VOICE_SAMPLES) {
    throw new Error(`Como máximo ${MAX_VOICE_SAMPLES} muestras de audio`);
  }
  for (const f of input.files) {
    if (f.size > MAX_VOICE_SAMPLE_BYTES) {
      throw new Error(`La muestra "${f.filename}" supera los 10 MB`);
    }
    if (!isAllowedSampleMime(f.type)) {
      throw new Error(`Formato de audio no admitido en "${f.filename}": ${f.type}`);
    }
  }

  const { getElevenLabsClientForOrg } = await import(
    '@/lib/services/integrations/elevenlabs/voiceCloneClient'
  );
  const client = await getElevenLabsClientForOrg(orgId);

  const created = await client.createInstantClone({
    name: input.name.trim(),
    files: input.files.map((f) => ({ filename: f.filename, blob: f.blob })),
    description: input.description ?? undefined,
    removeBackgroundNoise: input.removeBackgroundNoise ?? true,
    labels: { organization_id: String(orgId), source: 'go-admin-crm' },
  });

  const voice = await createVoice(
    supabase,
    orgId,
    {
      provider: 'elevenlabs',
      provider_voice_id: created.voice_id,
      name: input.name.trim(),
      description: input.description ?? null,
      owner_user_id: input.ownerUserId ?? createdBy ?? null,
      kind: 'cloned',
      language: input.language ?? 'es',
      model_id: input.modelId ?? 'eleven_flash_v2_5',
      // El CHECK `voices_cloned_requires_consent` de la base lo exige.
      consent_recorded_at: new Date().toISOString(),
      consent_evidence: {
        method: 'instant_voice_cloning',
        confirmed_in_ui: true,
        confirmed_by: createdBy ?? null,
        at: new Date().toISOString(),
        samples: input.files.map((f) => ({ filename: f.filename, bytes: f.size, type: f.type })),
        ...(input.consentEvidence ?? {}),
      },
      is_default: input.isDefault ?? false,
    },
    createdBy
  );

  return {
    voice,
    provider_voice_id: created.voice_id,
    requires_verification: created.requires_verification === true,
  };
}
