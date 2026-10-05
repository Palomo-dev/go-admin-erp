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
import { RequestDeadlineError } from '@/lib/utils/requestDeadline';

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
const workspaceCache = new Map<string, CacheEntry<Map<string, WorkspaceVoiceInfo>>>();
const previewCache = new Map<string, CacheEntry<ArrayBuffer>>();
const accountCache = new Map<string, CacheEntry<VoiceAccountCapabilities>>();

interface ReadFlight<T> {
  controller: AbortController;
  promise: Promise<T>;
  subscribers: number;
  settled: boolean;
}
const libraryFlights = new Map<string, ReadFlight<LibraryPage>>();
const workspaceFlights = new Map<string, ReadFlight<Map<string, WorkspaceVoiceInfo>>>();
const accountFlights = new Map<string, ReadFlight<VoiceAccountCapabilities>>();

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RequestDeadlineError('REQUEST_ABORTED');
}

/** La huella es opaca; nunca contiene la credencial. Dobles antiguos pueden omitirla. */
function configurationKey(orgId: number, client: { cacheKey?: string }): string {
  return `${orgId}:${client.cacheKey ?? 'sin-huella'}`;
}

/** Sólo lecturas: cada consumidor cancela su espera, el último cancela la red compartida. */
function cachedRead<T>(
  cache: Map<string, CacheEntry<T>>, flights: Map<string, ReadFlight<T>>,
  key: string, ttl: number, signal: AbortSignal | undefined,
  load: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  throwIfAborted(signal);
  const cached = readCache(cache, key, ttl);
  if (cached !== null) return Promise.resolve(cached);
  let flight = flights.get(key);
  if (!flight) {
    const created: ReadFlight<T> = { controller: new AbortController(), subscribers: 0, settled: false, promise: Promise.resolve().then(() => {
      throwIfAborted(created.controller.signal);
      return load(created.controller.signal);
    }).then(value => {
      created.settled = true;
      throwIfAborted(created.controller.signal);
      // Una lectura retirada o invalidada nunca repuebla la caché ni reemplaza la nueva.
      if (flights.get(key) === created && created.subscribers > 0) writeCache(cache, key, value);
      return value;
    }, error => { created.settled = true; throw error; }).finally(() => {
      if (flights.get(key) === created) flights.delete(key);
    }) };
    flights.set(key, created); flight = created;
  }
  const current = flight;
  current.subscribers++;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = (success: boolean, value: unknown) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', cancel);
      current.controller.signal.removeEventListener('abort', cancel);
      current.subscribers--;
      if (!current.settled && current.subscribers === 0) {
        if (flights.get(key) === current) flights.delete(key);
        current.controller.abort();
      }
      if (success) resolve(value as T); else reject(value);
    };
    const cancel = () => finish(false, new RequestDeadlineError('REQUEST_ABORTED'));
    signal?.addEventListener('abort', cancel, { once: true });
    current.controller.signal.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted || current.controller.signal.aborted) cancel();
    current.promise.then(value => finish(true, value), error => finish(false, error));
  });
}

function invalidateWorkspace(orgId: number): void {
  const prefix = `${orgId}:`;
  for (const key of workspaceCache.keys()) if (key.startsWith(prefix)) workspaceCache.delete(key);
  for (const [key, flight] of workspaceFlights) if (key.startsWith(prefix)) {
    workspaceFlights.delete(key); flight.controller.abort();
  }
}

function propagateCancellation(error: unknown, signal?: AbortSignal): void {
  throwIfAborted(signal);
  if (error instanceof RequestDeadlineError && error.code === 'REQUEST_ABORTED') throw error;
}

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
  for (const flights of [libraryFlights, workspaceFlights, accountFlights]) {
    for (const flight of flights.values()) flight.controller.abort();
    flights.clear();
  }
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
export async function getAccountCapabilities(orgId: number, signal?: AbortSignal): Promise<VoiceAccountCapabilities | null> {
  throwIfAborted(signal);
  try {
    const client = await getElevenLabsClientForOrg(orgId, { signal });
    return await cachedRead(accountCache, accountFlights, configurationKey(orgId, client), ACCOUNT_TTL_MS, signal, async sharedSignal => {
      const sub = await client.getSubscription(sharedSignal);
      return { tier: sub.tier, free_tier: sub.tier === 'free', can_clone: sub.can_use_instant_voice_cloning };
    });
  } catch (err) {
    propagateCancellation(err, signal);
    console.warn('[voiceLibrary] sin datos del plan:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Biblioteca pública ──────────────────────────────────────────────────────

export async function searchLibraryVoices(orgId: number, filters: LibraryFilters, signal?: AbortSignal): Promise<LibraryPage> {
  throwIfAborted(signal);
  const query = buildSharedVoicesQuery(filters);
  const client = await getElevenLabsClientForOrg(orgId, { signal });
  const key = JSON.stringify([configurationKey(orgId, client), query.toString()]);
  return cachedRead(libraryCache, libraryFlights, key, LIBRARY_TTL_MS, signal, async sharedSignal => {
    const page = await client.listSharedVoices(query, sharedSignal);
    return { voices: page.voices.map(normalizeSharedVoice), has_more: page.has_more, total_count: page.total_count, page: Number(query.get('page') ?? 0) };
  });
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
  invalidateWorkspace(orgId);

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

async function loadWorkspaceMap(orgId: number, signal?: AbortSignal, resolvedClient?: Awaited<ReturnType<typeof getElevenLabsClientForOrg>>): Promise<Map<string, WorkspaceVoiceInfo>> {
  throwIfAborted(signal);
  const client = resolvedClient ?? await getElevenLabsClientForOrg(orgId, { signal });
  return cachedRead(workspaceCache, workspaceFlights, configurationKey(orgId, client), WORKSPACE_TTL_MS, signal, async sharedSignal => {
    const list = await client.listVoices(sharedSignal);
    const map = new Map<string, WorkspaceVoiceInfo>();
    for (const v of list) map.set(v.voice_id, { preview_url: v.preview_url || null, labels: v.labels ?? {}, category: v.category ?? null });
    return map;
  });
}

/**
 * Catálogo de la organización con `preview_url` y etiquetas del proveedor.
 * Si el proveedor falla o no hay clave, devuelve las filas sin enriquecer:
 * la pantalla no se queda en blanco por un problema de ElevenLabs.
 */
export async function listVoicesEnriched(supabase: SupabaseClient, orgId: number, signal?: AbortSignal): Promise<VoiceRowEnriched[]> {
  throwIfAborted(signal);
  const rows = await listVoices(supabase, orgId);
  throwIfAborted(signal);
  let workspace: Map<string, WorkspaceVoiceInfo> | null = null;
  if (rows.some((r) => r.provider === 'elevenlabs')) {
    try {
      workspace = await loadWorkspaceMap(orgId, signal);
    } catch (err) {
      propagateCancellation(err, signal);
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
    invalidateWorkspace(orgId);
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

  const client = await getElevenLabsClientForOrg(orgId);
  const workspace = await loadWorkspaceMap(orgId, undefined, client);
  const info = workspace.get(row.provider_voice_id);
  if (info?.preview_url) return { kind: 'url', url: info.preview_url };

  const modelId = row.model_id || 'eleven_flash_v2_5';
  const key = JSON.stringify([configurationKey(orgId, client), row.provider_voice_id, modelId]);
  const cached = readCache(previewCache, key, PREVIEW_TTL_MS);
  if (cached) return { kind: 'audio', audio: cached, contentType: 'audio/mpeg' };

  const audio = await client.synthesize(row.provider_voice_id, PREVIEW_PHRASE_ES, modelId);
  writeCache(previewCache, key, audio);
  return { kind: 'audio', audio, contentType: 'audio/mpeg' };
}
