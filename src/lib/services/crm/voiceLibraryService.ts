/**
 * Biblioteca pública de voces de ElevenLabs — parte con red (brief UX 6.1).
 *
 * Solo se ejecuta en el servidor: la clave del proveedor nunca llega al
 * navegador. La parte pura (normalización, filtros, errores humanos) vive en
 * `voiceLibrary.ts`.
 *
 * Caché corta en memoria del proceso: la biblioteca cambia poco y cada
 * búsqueda es una llamada al proveedor.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSharedVoicesQuery,
  normalizeSharedVoice,
  type AddLibraryVoiceBody,
  type LibraryFilters,
  type LibraryVoice,
} from './voiceLibrary';
import { createVoice, deleteVoice, listVoices, type VoiceRow } from './voiceCatalogService';
import { ElevenLabsError, getElevenLabsClientForOrg } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';

export interface LibraryPage {
  voices: LibraryVoice[];
  has_more: boolean;
  total_count: number;
  page: number;
}

const LIBRARY_TTL_MS = 5 * 60 * 1000;
const WORKSPACE_TTL_MS = 60 * 1000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

interface CacheEntry<T> {
  at: number;
  value: T;
}

const ACCOUNT_TTL_MS = 10 * 60 * 1000;

const libraryCache = new Map<string, CacheEntry<LibraryPage>>();
const workspaceCache = new Map<number, CacheEntry<Map<string, WorkspaceVoiceInfo>>>();
const previewCache = new Map<string, CacheEntry<ArrayBuffer>>();
const accountCache = new Map<number, CacheEntry<VoiceAccountCapabilities>>();

function readCache<K, V>(map: Map<K, CacheEntry<V>>, key: K, ttl: number): V | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache<K, V>(map: Map<K, CacheEntry<V>>, key: K, value: V): void {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, { at: Date.now(), value });
}

/** Solo para pruebas: vacía las cachés del proceso. */
export function clearVoiceLibraryCaches(): void {
  libraryCache.clear();
  workspaceCache.clear();
  previewCache.clear();
  accountCache.clear();
}

// ─── Plan de la cuenta del proveedor ─────────────────────────────────────────

export interface VoiceAccountCapabilities {
  tier: string;
  /** Plan gratuito: no puede añadir voces con `free_users_allowed=false` ni clonar. */
  free_tier: boolean;
  can_clone: boolean;
}

/**
 * Qué permite el plan de ElevenLabs de la clave en uso, para avisar ANTES del
 * clic (voces solo de pago, clonación). `null` si no hay clave o el proveedor
 * no responde: la UI no bloquea nada que no sepa con certeza.
 */
export async function getAccountCapabilities(orgId: number): Promise<VoiceAccountCapabilities | null> {
  const cached = readCache(accountCache, orgId, ACCOUNT_TTL_MS);
  if (cached) return cached;
  try {
    const client = await getElevenLabsClientForOrg(orgId);
    const sub = await client.getSubscription();
    const value: VoiceAccountCapabilities = {
      tier: sub.tier,
      free_tier: sub.tier === 'free',
      can_clone: sub.can_use_instant_voice_cloning,
    };
    writeCache(accountCache, orgId, value);
    return value;
  } catch (err) {
    console.warn('[voiceLibrary] sin datos del plan:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Biblioteca pública ──────────────────────────────────────────────────────

export async function searchLibraryVoices(orgId: number, filters: LibraryFilters): Promise<LibraryPage> {
  const query = buildSharedVoicesQuery(filters);
  const key = query.toString();
  const cached = readCache(libraryCache, key, LIBRARY_TTL_MS);
  if (cached) return cached;

  const client = await getElevenLabsClientForOrg(orgId);
  const page = await client.listSharedVoices(query);
  const result: LibraryPage = {
    voices: page.voices.map(normalizeSharedVoice),
    has_more: page.has_more,
    total_count: page.total_count,
    page: Number(query.get('page') ?? 0),
  };
  writeCache(libraryCache, key, result);
  return result;
}

export type AddLibraryVoiceInput = Pick<AddLibraryVoiceBody, 'voice_id' | 'public_owner_id' | 'name'> &
  Partial<Pick<AddLibraryVoiceBody, 'description' | 'language'>>;

/**
 * «Añadir a mis voces»: copia la voz al workspace del proveedor (sin eso no se
 * puede sintetizar con ella) y la registra en el catálogo de la organización.
 * Si ya estaba en el catálogo, devuelve la fila existente sin duplicar.
 */
export async function addLibraryVoiceToCatalog(
  supabase: SupabaseClient,
  orgId: number,
  input: AddLibraryVoiceInput,
  userId?: string | null
): Promise<{ voice: VoiceRow; already_in_catalog: boolean }> {
  const voiceId = input.voice_id?.trim();
  const owner = input.public_owner_id?.trim();
  const name = input.name?.trim();
  if (!voiceId || !owner || !name) throw new Error('Faltan datos de la voz: identificador, propietario y nombre');

  const existing = (await listVoices(supabase, orgId)).find(
    (v) => v.provider === 'elevenlabs' && v.provider_voice_id === voiceId
  );
  if (existing) return { voice: existing, already_in_catalog: true };

  const client = await getElevenLabsClientForOrg(orgId);
  try {
    await client.addSharedVoice(owner, voiceId, name);
  } catch (err) {
    // Si otra organización de la misma cuenta ya la copió, el proveedor lo rechaza
    // pero la voz está disponible: seguimos y solo registramos la fila.
    const already = err instanceof ElevenLabsError && /already|ya existe|exists/i.test(err.message);
    if (!already) throw err;
  }
  workspaceCache.delete(orgId);

  const voice = await createVoice(
    supabase,
    orgId,
    {
      provider: 'elevenlabs',
      provider_voice_id: voiceId,
      name,
      description: input.description ?? null,
      kind: 'library',
      language: input.language?.trim() || 'es',
    },
    userId
  );
  return { voice, already_in_catalog: false };
}

// ─── Mis voces, enriquecidas con lo que sabe el proveedor ────────────────────

export interface WorkspaceVoiceInfo {
  preview_url: string | null;
  labels: Record<string, string>;
  category: string | null;
}

export type VoiceRowEnriched = VoiceRow & {
  preview_url: string | null;
  labels: Record<string, string>;
  provider_category: string | null;
};

async function loadWorkspaceMap(orgId: number): Promise<Map<string, WorkspaceVoiceInfo>> {
  const cached = readCache(workspaceCache, orgId, WORKSPACE_TTL_MS);
  if (cached) return cached;
  const client = await getElevenLabsClientForOrg(orgId);
  const list = await client.listVoices();
  const map = new Map<string, WorkspaceVoiceInfo>();
  for (const v of list) {
    map.set(v.voice_id, { preview_url: v.preview_url || null, labels: v.labels ?? {}, category: v.category ?? null });
  }
  writeCache(workspaceCache, orgId, map);
  return map;
}

/**
 * Catálogo de la organización con `preview_url` y etiquetas del proveedor.
 * Si el proveedor falla o no hay clave, devuelve las filas sin enriquecer:
 * la pantalla no se queda en blanco por un problema de ElevenLabs.
 */
export async function listVoicesEnriched(supabase: SupabaseClient, orgId: number): Promise<VoiceRowEnriched[]> {
  const rows = await listVoices(supabase, orgId);
  let workspace: Map<string, WorkspaceVoiceInfo> | null = null;
  if (rows.some((r) => r.provider === 'elevenlabs')) {
    try {
      workspace = await loadWorkspaceMap(orgId);
    } catch (err) {
      console.warn('[voiceLibrary] sin datos del workspace:', err instanceof Error ? err.message : err);
    }
  }
  return rows.map((r) => {
    const info = r.provider === 'elevenlabs' ? workspace?.get(r.provider_voice_id) : undefined;
    return {
      ...r,
      preview_url: info?.preview_url ?? null,
      labels: info?.labels ?? {},
      provider_category: info?.category ?? null,
    };
  });
}

/**
 * Borra la voz del catálogo y, si es una voz que esta cuenta copió o clonó,
 * también del workspace del proveedor (libera el hueco y, para una voz clonada,
 * cumple el derecho a eliminarla). Las voces «premade» del proveedor no se
 * pueden borrar allí y no se intenta.
 */
export async function removeVoice(
  supabase: SupabaseClient,
  orgId: number,
  id: string,
  countOtherReferences: (providerVoiceId: string) => Promise<number>
): Promise<{ removed_from_provider: boolean }> {
  const row = (await listVoices(supabase, orgId)).find((v) => v.id === id);
  if (!row) throw new Error('La voz no existe en el catálogo de la organización');

  await deleteVoice(supabase, orgId, id);

  if (row.provider !== 'elevenlabs') return { removed_from_provider: false };
  try {
    const workspace = await loadWorkspaceMap(orgId);
    const info = workspace.get(row.provider_voice_id);
    if (!info || info.category === 'premade') return { removed_from_provider: false };
    // Con clave de plataforma compartida, otra organización puede seguir usándola.
    if ((await countOtherReferences(row.provider_voice_id)) > 0) return { removed_from_provider: false };
    const client = await getElevenLabsClientForOrg(orgId);
    await client.deleteVoice(row.provider_voice_id);
    workspaceCache.delete(orgId);
    return { removed_from_provider: true };
  } catch (err) {
    console.warn('[voiceLibrary] no se pudo borrar en el proveedor:', err instanceof Error ? err.message : err);
    return { removed_from_provider: false };
  }
}

// ─── Escuchar una voz del catálogo ───────────────────────────────────────────

export const PREVIEW_PHRASE_ES =
  'Hola, soy la voz de tu asistente. Puedo llamar a tus clientes, confirmar citas y resolver dudas con naturalidad.';

export type VoicePreview =
  | { kind: 'url'; url: string }
  | { kind: 'audio'; audio: ArrayBuffer; contentType: 'audio/mpeg' };

/**
 * Devuelve la previsualización de una voz del catálogo: la URL pública del
 * proveedor si existe, o una frase corta sintetizada (con caché de 10 minutos
 * para no gastar caracteres cada vez que se pulsa «Escuchar»).
 */
export async function previewCatalogVoice(supabase: SupabaseClient, orgId: number, id: string): Promise<VoicePreview> {
  const row = (await listVoices(supabase, orgId)).find((v) => v.id === id);
  if (!row) throw new Error('La voz no existe en el catálogo de la organización');
  if (row.provider !== 'elevenlabs') throw new Error('Solo se pueden previsualizar voces de ElevenLabs');

  const workspace = await loadWorkspaceMap(orgId);
  const info = workspace.get(row.provider_voice_id);
  if (info?.preview_url) return { kind: 'url', url: info.preview_url };

  const key = `${orgId}:${row.provider_voice_id}`;
  const cached = readCache(previewCache, key, PREVIEW_TTL_MS);
  if (cached) return { kind: 'audio', audio: cached, contentType: 'audio/mpeg' };

  const client = await getElevenLabsClientForOrg(orgId);
  const audio = await client.synthesize(row.provider_voice_id, PREVIEW_PHRASE_ES, row.model_id || 'eleven_flash_v2_5');
  writeCache(previewCache, key, audio);
  return { kind: 'audio', audio, contentType: 'audio/mpeg' };
}
