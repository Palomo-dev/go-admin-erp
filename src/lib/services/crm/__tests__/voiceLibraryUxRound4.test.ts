/**
 * Rediseño UX de «Agentes IA → Voces» — ronda 4, cierre (2026-09-15).
 *
 * Lista exacta del tester de la ronda 3 (escritas antes, vistas en rojo):
 *  1. `clone/route.ts` leía cada muestra en memoria ANTES de comprobar tamaño y
 *     MIME (+44 MB RSS con 50 MB). Ahora: `content-length` antes de `formData()`
 *     y `size`/MIME antes de medir. Se prueba con un doble de `File` que cuenta
 *     las llamadas a `arrayBuffer`: con 50 MB o `text/plain` → 400 y 0 llamadas.
 *  2. Huecos de mutación: C04 `requireOrgAdmin` en todas las rutas de escritura
 *     (dinámico + guarda estática sobre la carpeta), D03 consentimiento en el
 *     servicio, D04 `organization_id` del input ignorado (y 403 + registro en
 *     las rutas), D02 tope de 10 MB, C03 `duration_source`, C05 `consent_at`
 *     extremo a extremo, C02 la evidencia usa la medida del servidor.
 *  3. Tinta del orbe ≥ 4,5:1 en TODA la zona del glifo, rasterizando el
 *     gradiente CSS (24 tonos × 3 separaciones × 24 ángulos, peor píxel).
 *  4. `NAME_MAX` también en servidor.
 *  BAJA: con `can_clone=false` «Crear» queda bloqueado; `video/webm` (así llega
 *  un .webm por el selector de archivos en Chrome) se acepta como alias.
 */

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

const mockCreateInstantClone = jest.fn();
const mockGetElevenLabsClient = jest.fn(async () => ({ createInstantClone: mockCreateInstantClone }));
jest.mock('@/lib/services/integrations/elevenlabs/voiceCloneClient', () => {
  class ElevenLabsError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, _detail?: unknown, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { ElevenLabsError, getElevenLabsClientForOrg: (...args: unknown[]) => mockGetElevenLabsClient(...(args as [])) };
});

const mockCtx = { organizationId: 120, userId: 'user-1', supabase: {} as SupabaseClient, roleName: 'Admin de organización', roleId: 2 };
const mockRequireOrgAdmin = jest.fn();
jest.mock('@/lib/utils/orgContext', () => {
  // F0-SEC r2: `readOrgBody` (módulo hoja) lanza la clase REAL; el mock expone esa
  // misma clase para que el `instanceof` de las rutas la reconozca.
  const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
  return {
    OrgContextError,
    getServerOrgContext: jest.fn(async () => mockCtx),
    requireOrgAdmin: (...args: unknown[]) => mockRequireOrgAdmin(...args),
  };
});

const mockRemoveVoice = jest.fn(async () => ({ removed: true }));
const mockAddLibraryVoice = jest.fn(async () => ({ id: 'row-lib', already_in_catalog: false }));
jest.mock('@/lib/services/crm/voiceLibraryService', () => ({
  listVoicesEnriched: jest.fn(async () => []),
  getAccountCapabilities: jest.fn(async () => null),
  removeVoice: (...args: unknown[]) => mockRemoveVoice(...(args as [])),
  addLibraryVoiceToCatalog: (...args: unknown[]) => mockAddLibraryVoice(...(args as [])),
  searchLibraryVoices: jest.fn(async () => ({ voices: [], has_more: false })),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => ({}) }));

import { NextRequest } from 'next/server';
import { POST as clonePost } from '@/app/api/crm/voices/clone/route';
import { MAX_CLONE_REQUEST_BYTES } from '@/lib/services/crm/voiceCatalogService';
import { POST as voicesPost, PATCH as voicesPatch, DELETE as voicesDelete } from '@/app/api/crm/voices/route';
import { POST as libraryPost } from '@/app/api/crm/voices/library/route';
import { cloneVoiceFromSample, createVoice, updateVoice, MAX_VOICE_SAMPLE_BYTES, isAllowedSampleMime } from '@/lib/services/crm/voiceCatalogService';
import { MAX_SAMPLE_BYTES, NAME_MAX, sanitizeConsentAt } from '@/lib/services/crm/voiceCloneScript';
import { voiceAvatar, inkForHues, glyphVeil, glyphZoneMinContrast, GLYPH_HALF_EXTENT, GLYPH_VEIL_ALPHA } from '@/lib/services/crm/voiceAvatar';
import { foreignOrganizationInBody } from '@/lib/services/crm/voiceLibrary';
import { OrgContextError } from '@/lib/utils/orgContext';

const SRC = path.join(process.cwd(), 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// ─── Dobles ──────────────────────────────────────────────────────────────────

/** Supabase mínimo: guarda lo insertado y lo actualizado. */
function fakeSupabase() {
  const inserted: Record<string, unknown>[] = [];
  const updated: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const from = () => ({
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 'row-1', ...row }, error: null }) }) };
    },
    update: (patch: Record<string, unknown>) => {
      const entry = { patch, filters: {} as Record<string, unknown> };
      updated.push(entry);
      const chain = {
        eq: (k: string, v: unknown) => { entry.filters[k] = v; return chain; },
        select: () => ({ maybeSingle: async () => ({ data: { id: 'row-1', ...patch }, error: null }) }),
        then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  });
  return { client: { from } as unknown as SupabaseClient, inserted, updated };
}

/** `File` que declara el tamaño que se le pida y cuenta cuántas veces se lee. */
class CountingFile extends File {
  arrayBufferCalls = 0;
  private readonly declaredSize: number;
  constructor(declaredSize: number, name: string, type: string, bytes: Uint8Array = new Uint8Array(64)) {
    super([bytes], name, { type });
    this.declaredSize = declaredSize;
  }
  get size(): number { return this.declaredSize; }
  async arrayBuffer(): Promise<ArrayBuffer> { this.arrayBufferCalls++; return super.arrayBuffer(); }
}

function wav(seconds: number, sampleRate = 16000): Uint8Array {
  const byteRate = sampleRate * 2;
  const dataSize = Math.round(byteRate * seconds);
  const buf = new Uint8Array(44 + dataSize);
  const v = new DataView(buf.buffer);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, byteRate, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, dataSize, true);
  return buf;
}

/** Petición al clon con `formData()` sustituido por un doble: así los `File` llegan tal cual. */
function cloneRequest(fields: Record<string, string>, samples: File[], headers: Record<string, string> = {}) {
  const req = new NextRequest('http://localhost/api/crm/voices/clone', { method: 'POST', headers });
  const formDataSpy = jest.fn(async () => ({
    get: (k: string) => fields[k] ?? null,
    getAll: (k: string) => (k === 'samples' ? samples : []),
  }) as unknown as FormData);
  Object.defineProperty(req, 'formData', { value: formDataSpy });
  return { req, formDataSpy };
}

async function postClone(fields: Record<string, string>, samples: File[], headers?: Record<string, string>) {
  const { req, formDataSpy } = cloneRequest({ name: 'PRUEBA-CLON-R4', consent: 'true', ...fields }, samples, headers);
  const res = await clonePost(req);
  return { status: res.status, json: (await res.json()) as { success?: boolean; error?: string }, formDataSpy };
}

const jsonReq = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

let db: ReturnType<typeof fakeSupabase>;
let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockRequireOrgAdmin.mockReset();
  mockCreateInstantClone.mockResolvedValue({ voice_id: 'NEW-VOICE', requires_verification: false });
  db = fakeSupabase();
  mockCtx.supabase = db.client;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

// ─── 1 · nada se lee en memoria antes de filtrar ─────────────────────────────

describe('1 · clone: content-length antes de formData(); size y MIME antes de medir', () => {
  test('MAX_VOICE_SAMPLE_BYTES es la MISMA constante que MAX_SAMPLE_BYTES del asistente (una sola fuente)', () => {
    expect(MAX_VOICE_SAMPLE_BYTES).toBe(MAX_SAMPLE_BYTES);
    expect(MAX_VOICE_SAMPLE_BYTES).toBe(10 * 1024 * 1024);
  });

  test('MAX_CLONE_REQUEST_BYTES = 5 muestras × 10 MB + margen', () => {
    expect(MAX_CLONE_REQUEST_BYTES).toBeGreaterThanOrEqual(5 * MAX_VOICE_SAMPLE_BYTES);
    expect(MAX_CLONE_REQUEST_BYTES).toBeLessThanOrEqual(5 * MAX_VOICE_SAMPLE_BYTES + 2 * 1024 * 1024);
  });

  test('content-length por encima del tope → 400 sin llamar a formData() ni al proveedor', async () => {
    const res = await postClone({}, [new CountingFile(64, 'a.wav', 'audio/wav')], { 'content-length': String(MAX_CLONE_REQUEST_BYTES + 1) });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/pesa|MB/i);
    expect(res.formDataSpy).not.toHaveBeenCalled();
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
  });

  test('content-length en el tope exacto sí se procesa', async () => {
    const res = await postClone({}, [new CountingFile(64, 'a.wav', 'audio/wav', wav(25))], { 'content-length': String(MAX_CLONE_REQUEST_BYTES) });
    expect(res.formDataSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(201);
  });

  test('una muestra de 50 MB audio/wav → 400 y 0 llamadas a arrayBuffer', async () => {
    const big = new CountingFile(50 * 1024 * 1024, 'grande.wav', 'audio/wav');
    const res = await postClone({}, [big]);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/10 MB/);
    expect(big.arrayBufferCalls).toBe(0);
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
  });

  test('text/plain → 400 y 0 llamadas a arrayBuffer', async () => {
    const txt = new CountingFile(64, 'x.txt', 'text/plain');
    const res = await postClone({}, [txt]);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Formato de audio no admitido/);
    expect(txt.arrayBufferCalls).toBe(0);
  });

  test('la muestra mala se rechaza aunque venga después de una buena: ninguna se lee', async () => {
    const ok = new CountingFile(64, 'ok.wav', 'audio/wav', wav(25));
    const bad = new CountingFile(MAX_VOICE_SAMPLE_BYTES + 1, 'grande.wav', 'audio/wav');
    const res = await postClone({}, [ok, bad]);
    expect(res.status).toBe(400);
    expect(ok.arrayBufferCalls + bad.arrayBufferCalls).toBe(0);
  });

  test('una muestra válida sí se lee (una vez) y se mide', async () => {
    const ok = new CountingFile(64, 'ok.wav', 'audio/wav', wav(25));
    const res = await postClone({}, [ok]);
    expect(res.status).toBe(201);
    expect(ok.arrayBufferCalls).toBe(1);
  });

  /** Petición real (multipart de verdad) con un File de 50 MB. */
  function realBigRequest(contentLength: number) {
    const file = new File([new Uint8Array(50 * 1024 * 1024)], 'grande.wav', { type: 'audio/wav' });
    const form = new FormData();
    form.set('name', 'PRUEBA-CLON-R4');
    form.set('consent', 'true');
    form.append('samples', file, file.name);
    return new NextRequest('http://localhost/api/crm/voices/clone', { method: 'POST', body: form, headers: { 'content-length': String(contentLength) } });
  }

  test('File real de 50 MB con content-length por encima del tope: el cuerpo nunca se lee (bodyUsed=false, ArrayBuffers sin crecer)', async () => {
    const req = realBigRequest(MAX_CLONE_REQUEST_BYTES + 1);
    // `arrayBuffers` cuenta la memoria de Buffer/ArrayBuffer del proceso: parsear el
    // multipart (+50 MB) y `arrayBuffer()` (+50 MB) la disparan; no leerlo, no.
    const before = process.memoryUsage().arrayBuffers;
    const res = await clonePost(req);
    const deltaMb = (process.memoryUsage().arrayBuffers - before) / (1024 * 1024);
    expect(res.status).toBe(400);
    expect(req.bodyUsed).toBe(false);
    expect(deltaMb).toBeLessThan(5);
  });

  test('File real de 50 MB con content-length honesto (bajo el tope total): multipart real, 400 por size y File.prototype.arrayBuffer nunca se llama', async () => {
    // Parsear el multipart cuesta lo que cueste a undici (lee el cuerpo y copia el
    // File; el crecimiento de ArrayBuffers depende del GC: 100 o 150 MB), pero la
    // copia adicional de `arrayBuffer()` —la que hacía la ruta— no ocurre.
    const spy = jest.spyOn(File.prototype, 'arrayBuffer');
    try {
      const req = realBigRequest(50 * 1024 * 1024 + 512);
      const res = await clonePost(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/10 MB/);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── 4 · NAME_MAX en servidor ────────────────────────────────────────────────

describe('4 · NAME_MAX también en el servidor', () => {
  test('nombre de 10 000 caracteres → 400 sin leer ni medir la muestra', async () => {
    const ok = new CountingFile(64, 'ok.wav', 'audio/wav', wav(25));
    const res = await postClone({ name: 'a'.repeat(10_000) }, [ok]);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(new RegExp(`${NAME_MAX} caracteres`));
    expect(ok.arrayBufferCalls).toBe(0);
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
  });

  test('createVoice (servicio) rechaza más de NAME_MAX y acepta NAME_MAX exacto', async () => {
    await expect(createVoice(db.client, 120, { provider_voice_id: 'v1', name: 'a'.repeat(NAME_MAX + 1) })).rejects.toThrow(/caracteres/);
    expect(db.inserted).toHaveLength(0);
    await createVoice(db.client, 120, { provider_voice_id: 'v1', name: 'a'.repeat(NAME_MAX) });
    expect(db.inserted).toHaveLength(1);
  });

  test('POST /api/crm/voices con nombre de 10 000 caracteres → 400', async () => {
    const res = await voicesPost(jsonReq('/api/crm/voices', 'POST', { provider_voice_id: 'v1', name: 'a'.repeat(10_000) }));
    expect(res.status).toBe(400);
    expect(db.inserted).toHaveLength(0);
  });
});

// ─── 2 · huecos de mutación ──────────────────────────────────────────────────

describe('2 · C04: requireOrgAdmin en TODAS las rutas de escritura de api/crm/voices/**', () => {
  test('guarda estática: cada handler POST/PATCH/PUT/DELETE de la carpeta llama a requireOrgAdmin(ctx)', () => {
    const dir = path.join(SRC, 'app', 'api', 'crm', 'voices');
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name === 'route.ts') out.push(p);
      }
      return out;
    };
    const routes = walk(dir);
    expect(routes.length).toBeGreaterThanOrEqual(4);
    const missing: string[] = [];
    let writeHandlers = 0;
    for (const file of routes) {
      const src = fs.readFileSync(file, 'utf8');
      const blocks = src.split(/(?=export async function )/);
      for (const block of blocks) {
        const m = /^export async function (POST|PATCH|PUT|DELETE)\b/.exec(block);
        if (!m) continue;
        writeHandlers++;
        if (!/requireOrgAdmin\(ctx\)/.test(block)) missing.push(`${path.relative(SRC, file)}#${m[1]}`);
      }
    }
    expect(writeHandlers).toBeGreaterThanOrEqual(5);
    expect(missing).toEqual([]);
  });

  test('dinámica: clone POST, voices POST/PATCH/DELETE y library POST exigen administrador', async () => {
    await postClone({}, [new CountingFile(64, 'ok.wav', 'audio/wav', wav(25))]);
    expect(mockRequireOrgAdmin).toHaveBeenCalledTimes(1);
    await voicesPost(jsonReq('/api/crm/voices', 'POST', { provider_voice_id: 'v1', name: 'Voz' }));
    expect(mockRequireOrgAdmin).toHaveBeenCalledTimes(2);
    await voicesPatch(jsonReq('/api/crm/voices', 'PATCH', { id: 'row-1', name: 'Otra' }));
    expect(mockRequireOrgAdmin).toHaveBeenCalledTimes(3);
    await voicesDelete(new NextRequest('http://localhost/api/crm/voices?id=row-1', { method: 'DELETE' }));
    expect(mockRequireOrgAdmin).toHaveBeenCalledTimes(4);
    await libraryPost(jsonReq('/api/crm/voices/library', 'POST', { voice_id: 'abc', public_owner_id: 'o1', name: 'Voz' }));
    expect(mockRequireOrgAdmin).toHaveBeenCalledTimes(5);
  });

  test('si requireOrgAdmin lanza, ninguna ruta de escritura toca la base ni el proveedor', async () => {
    mockRequireOrgAdmin.mockImplementation(() => { throw Object.assign(new OrgContextError('Solo administradores', 403), { statusCode: 403 }); });
    const ok = new CountingFile(64, 'ok.wav', 'audio/wav', wav(25));
    expect((await postClone({}, [ok])).status).toBe(403);
    expect((await voicesPost(jsonReq('/api/crm/voices', 'POST', { provider_voice_id: 'v1', name: 'Voz' }))).status).toBe(403);
    expect((await voicesPatch(jsonReq('/api/crm/voices', 'PATCH', { id: 'row-1', name: 'x' }))).status).toBe(403);
    expect((await voicesDelete(new NextRequest('http://localhost/api/crm/voices?id=row-1', { method: 'DELETE' }))).status).toBe(403);
    expect((await libraryPost(jsonReq('/api/crm/voices/library', 'POST', { voice_id: 'abc', public_owner_id: 'o1', name: 'Voz' }))).status).toBe(403);
    expect(db.inserted).toHaveLength(0);
    expect(db.updated).toHaveLength(0);
    expect(mockRemoveVoice).not.toHaveBeenCalled();
    expect(mockAddLibraryVoice).not.toHaveBeenCalled();
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
    expect(ok.arrayBufferCalls).toBe(0);
  });
});

describe('2 · D03/D02: el SERVICIO rechaza sin consentimiento y por encima de 10 MB, antes del proveedor', () => {
  const file = (size: number, type = 'audio/wav') => ({ filename: 'm.wav', type, size, blob: new Blob([new Uint8Array(8)]) });

  test('D03: consentConfirmed=false → error de consentimiento; ni cliente ni insert', async () => {
    await expect(cloneVoiceFromSample(db.client, 120, { name: 'Voz', consentConfirmed: false, files: [file(64)] })).rejects.toThrow(/consentimiento/);
    expect(mockGetElevenLabsClient).not.toHaveBeenCalled();
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });

  test('D02: 10 MB + 1 byte → «supera los 10 MB»; 10 MB exactos pasa', async () => {
    await expect(cloneVoiceFromSample(db.client, 120, { name: 'Voz', consentConfirmed: true, files: [file(MAX_VOICE_SAMPLE_BYTES + 1)] })).rejects.toThrow(/10 MB/);
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
    await cloneVoiceFromSample(db.client, 120, { name: 'Voz', consentConfirmed: true, files: [file(MAX_VOICE_SAMPLE_BYTES)] });
    expect(mockCreateInstantClone).toHaveBeenCalledTimes(1);
  });

  test('D02: sexta muestra → error de máximo; MIME ajeno → formato no admitido', async () => {
    await expect(cloneVoiceFromSample(db.client, 120, { name: 'Voz', consentConfirmed: true, files: Array.from({ length: 6 }, () => file(64)) })).rejects.toThrow(/máximo 5/);
    await expect(cloneVoiceFromSample(db.client, 120, { name: 'Voz', consentConfirmed: true, files: [file(64, 'text/plain')] })).rejects.toThrow(/no admitido/);
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
  });
});

describe('2 · D04: organization_id nunca sale del input', () => {
  test('foreignOrganizationInBody (una sola decisión para las tres rutas): ausente, vacío o la misma → null; otra o basura → el valor', () => {
    expect(foreignOrganizationInBody(undefined, 120)).toBeNull();
    expect(foreignOrganizationInBody(null, 120)).toBeNull();
    expect(foreignOrganizationInBody('', 120)).toBeNull();
    expect(foreignOrganizationInBody('  ', 120)).toBeNull();
    expect(foreignOrganizationInBody(120, 120)).toBeNull();
    expect(foreignOrganizationInBody('120', 120)).toBeNull();
    expect(foreignOrganizationInBody(999, 120)).toBe(999);
    expect(foreignOrganizationInBody('121', 120)).toBe('121');
    expect(foreignOrganizationInBody('abc', 120)).toBe('abc');
    expect(foreignOrganizationInBody(0, 120)).toBe(0);
  });

  test('createVoice ignora organization_id (y id, created_at) del input: la fila lleva la organización de la sesión', async () => {
    const hostile = { provider_voice_id: 'v1', name: 'Voz', organization_id: 999, id: 'inyectado', created_at: '2000-01-01' } as unknown as Parameters<typeof createVoice>[2];
    const created = await createVoice(db.client, 120, hostile, 'user-1');
    expect(db.inserted[0]).toMatchObject({ organization_id: 120, created_by: 'user-1' });
    expect(db.inserted[0]).not.toHaveProperty('id');
    expect(db.inserted[0]).not.toHaveProperty('created_at');
    expect(created.organization_id).toBe(120);
  });

  test('updateVoice ignora organization_id del input y filtra por la organización de la sesión', async () => {
    await updateVoice(db.client, 120, 'row-1', { name: 'Nueva', organization_id: 999 } as unknown as Parameters<typeof updateVoice>[3]);
    expect(db.updated[0].patch).not.toHaveProperty('organization_id');
    expect(db.updated[0].filters).toEqual({ id: 'row-1', organization_id: 120 });
  });

  test('POST /api/crm/voices con organization_id ajeno → 403, se registra y no se inserta', async () => {
    const res = await voicesPost(jsonReq('/api/crm/voices', 'POST', { provider_voice_id: 'v1', name: 'Voz', organization_id: 999 }));
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: 120, body: 999 }));
    expect(db.inserted).toHaveLength(0);
  });

  test('POST /api/crm/voices con la MISMA organización en el body pasa (no es un ataque)', async () => {
    const res = await voicesPost(jsonReq('/api/crm/voices', 'POST', { provider_voice_id: 'v1', name: 'Voz', organization_id: 120 }));
    expect(res.status).toBe(201);
    expect(db.inserted[0]).toMatchObject({ organization_id: 120 });
  });

  test('PATCH /api/crm/voices con organization_id ajeno → 403 y no se escribe', async () => {
    const res = await voicesPatch(jsonReq('/api/crm/voices', 'PATCH', { id: 'row-1', name: 'x', organization_id: '121' }));
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(db.updated).toHaveLength(0);
  });

  test('POST /api/crm/voices/library con organization_id ajeno → 403, se registra y no se copia la voz', async () => {
    const res = await libraryPost(jsonReq('/api/crm/voices/library', 'POST', { voice_id: 'abc', public_owner_id: 'o1', name: 'Voz', organization_id: 999 }));
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: 120, body: 999 }));
    expect(mockAddLibraryVoice).not.toHaveBeenCalled();
  });

  test('POST /api/crm/voices/library con la MISMA organización pasa (no es un ataque)', async () => {
    const res = await libraryPost(jsonReq('/api/crm/voices/library', 'POST', { voice_id: 'abc', public_owner_id: 'o1', name: 'Voz', organization_id: 120 }));
    expect(res.status).toBe(201);
    expect(mockAddLibraryVoice).toHaveBeenCalledTimes(1);
  });

  test('clone con organization_id ajeno en el multipart → 403 antes de leer muestras', async () => {
    const ok = new CountingFile(64, 'ok.wav', 'audio/wav', wav(25));
    const res = await postClone({ organization_id: '999' }, [ok]);
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(ok.arrayBufferCalls).toBe(0);
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
  });
});

describe('2 · C02/C03/C05: la evidencia dice la verdad', () => {
  const evidence = () => (db.inserted[0] as { consent_evidence: Record<string, unknown> }).consent_evidence;
  const sample = () => evidence().sample as { duration_seconds: number };

  test('C02+C03: el servidor midió 25 s aunque el cliente diga 99 → duration_seconds=25, server_measured', async () => {
    const res = await postClone({ duration_seconds: '99' }, [new CountingFile(64, 'ok.wav', 'audio/wav', wav(25))]);
    expect(res.status).toBe(201);
    expect(sample().duration_seconds).toBeCloseTo(25, 0);
    expect(evidence().duration_source).toBe('server_measured');
  });

  test('C03: no se pudo medir (ogg opaco) → duration_seconds del cliente y client_reported', async () => {
    const opaque = new CountingFile(64, 'm.ogg', 'audio/ogg;codecs=opus', new Uint8Array(64));
    const res = await postClone({ duration_seconds: '30.26' }, [opaque]);
    expect(res.status).toBe(201);
    expect(sample().duration_seconds).toBe(30.3);
    expect(evidence().duration_source).toBe('client_reported');
  });

  test('C03: sin medida ni dato del cliente → 0 y client_reported (no se inventa)', async () => {
    await postClone({}, [new CountingFile(64, 'm.ogg', 'audio/ogg', new Uint8Array(64))]);
    expect(sample().duration_seconds).toBe(0);
    expect(evidence().duration_source).toBe('client_reported');
  });

  test('C05: consent_at=2099 → accepted_at es la hora del servidor (igual a recorded_at)', async () => {
    const t0 = Date.now();
    await postClone({ consent_at: '2099-01-01T00:00:00.000Z' }, [new CountingFile(64, 'ok.wav', 'audio/wav', wav(25))]);
    const accepted = Date.parse(String(evidence().accepted_at));
    expect(accepted).toBeGreaterThanOrEqual(t0);
    expect(accepted).toBeLessThanOrEqual(Date.now());
    expect(evidence().accepted_at).toBe(evidence().recorded_at);
  });

  test('C05: consent_at reciente se conserva; de hace 25 h o basura, no', async () => {
    const now = Date.parse('2026-09-15T12:00:00.000Z');
    expect(sanitizeConsentAt('2026-09-15T11:59:00.000Z', now)).toBe('2026-09-15T11:59:00.000Z');
    expect(sanitizeConsentAt('2026-09-14T11:00:00.000Z', now)).toBe('2026-09-15T12:00:00.000Z');
    expect(sanitizeConsentAt('ayer', now)).toBe('2026-09-15T12:00:00.000Z');
    const recent = new Date(Date.now() - 60_000).toISOString();
    await postClone({ consent_at: recent }, [new CountingFile(64, 'ok.wav', 'audio/wav', wav(25))]);
    expect(evidence().accepted_at).toBe(recent);
  });
});

// ─── 3 · tinta del orbe rasterizada ──────────────────────────────────────────

/**
 * Rasterizador del CSS que recibe el navegador: `linear-gradient(Adeg, c0 0%, c1 100%)`
 * con la longitud de línea |W·sin A| + |H·cos A| (CSS Images 3, §3.1.1) e interpolación
 * sRGB por canal, y encima el velo `radial-gradient(circle closest-side, …)`. Se
 * evalúan solo los píxeles de la caja del glifo (±GLYPH_HALF_EXTENT del centro).
 */
const lin = (n: number) => (n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4));
const luminance = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
function hsl(h: number, s: number, l: number): number[] {
  const sat = s / 100, lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  return [r + m, g + m, b + m];
}
function parseLinear(gradient: string) {
  const m = /^linear-gradient\((-?\d+(?:\.\d+)?)deg,\s*hsl\((\d+) (\d+)% (\d+)%\) 0%,\s*hsl\((\d+) (\d+)% (\d+)%\) 100%\)$/.exec(gradient);
  if (!m) throw new Error(`gradient no reconocido: ${gradient}`);
  return { angle: Number(m[1]), c0: hsl(+m[2], +m[3], +m[4]), c1: hsl(+m[5], +m[6], +m[7]) };
}
function parseVeil(veil: string | undefined) {
  if (!veil) return null;
  const m = /^radial-gradient\(circle closest-side,\s*rgba\((\d+),(\d+),(\d+),(0?\.\d+)\) 0 (\d+)%,\s*transparent (\d+)%\)$/.exec(veil);
  if (!m) throw new Error(`veil no reconocido: ${veil}`);
  return { rgb: [+m[1] / 255, +m[2] / 255, +m[3] / 255], alpha: +m[4], solid: +m[5] / 100, fade: +m[6] / 100 };
}
function worstGlyphContrast(spec: { gradient: string; ink: 'light' | 'dark'; veil?: string }, size = 48): number {
  const { angle, c0, c1 } = parseLinear(spec.gradient);
  const veil = parseVeil(spec.veil);
  const rad = (angle * Math.PI) / 180;
  const dir = [Math.sin(rad), -Math.cos(rad)]; // 0deg = hacia arriba, sentido horario (y crece hacia abajo)
  const lineLen = size * Math.abs(Math.sin(rad)) + size * Math.abs(Math.cos(rad));
  const half = GLYPH_HALF_EXTENT * size;
  const c = size / 2;
  const inkLum = spec.ink === 'light' ? 1 : 0;
  let worst = Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - c, py = y + 0.5 - c;
      if (Math.abs(px) > half || Math.abs(py) > half) continue;
      const t = Math.min(1, Math.max(0, 0.5 + (px * dir[0] + py * dir[1]) / lineLen));
      let rgb = c0.map((v, i) => v + (c1[i] - v) * t);
      if (veil) {
        const r = Math.hypot(px, py) / (size / 2); // closest-side: 100% = radio del orbe
        const a = r <= veil.solid ? veil.alpha : r >= veil.fade ? 0 : veil.alpha * (1 - (r - veil.solid) / (veil.fade - veil.solid));
        rgb = rgb.map((v, i) => v * (1 - a) + veil.rgb[i] * a);
      }
      worst = Math.min(worst, contrast(luminance(rgb), inkLum));
    }
  }
  return worst;
}

describe('3 · tinta del orbe ≥ 4,5:1 en toda la caja del glifo (rasterizado)', () => {
  test('24 tonos × 3 separaciones × 24 ángulos: el peor píxel bajo el glifo contrasta ≥ 4,5 con la tinta', () => {
    const failures: string[] = [];
    let worstAll = Infinity;
    for (let hueA = 0; hueA < 360; hueA += 15) {
      for (const gap of [40, 110, 179]) {
        const hueB = (hueA + gap) % 360;
        const ink = inkForHues(hueA, hueB);
        for (let angle = 0; angle < 360; angle += 15) {
          const gradient = `linear-gradient(${angle}deg, hsl(${hueA} 78% 58%) 0%, hsl(${hueB} 72% 46%) 100%)`;
          const spec = { gradient, ink, veil: glyphVeil(ink) };
          const worst = worstGlyphContrast(spec);
          worstAll = Math.min(worstAll, worst);
          if (worst < 4.5) failures.push(`${hueA}/${hueB}@${angle} ${ink} ${worst.toFixed(2)}`);
        }
      }
    }
    expect({ worst: Number(worstAll.toFixed(2)), failures: failures.slice(0, 6), count: failures.length }).toEqual({ worst: expect.any(Number), failures: [], count: 0 });
    expect(worstAll).toBeGreaterThanOrEqual(4.5);
  });

  test('con voice_id reales del catálogo el peor píxel también pasa', () => {
    const ids = ['109o5orBWJUFCKODv4Rd', 'EXAVITQu4vr4xnSDxMaL', 'ThT5KcBeYPX3keUQqHPh', 'pNInz6obpgDQGcFmaJgB', 'nueva-voz', 'a', '', 'zz-99'];
    for (const id of ids) expect({ id, worst: Number(worstGlyphContrast(voiceAvatar(id)).toFixed(2)) }).toEqual({ id, worst: expect.any(Number) });
    for (const id of ids) expect(worstGlyphContrast(voiceAvatar(id))).toBeGreaterThanOrEqual(4.5);
  });

  test('la tinta elegida es la MEJOR de las dos en la zona del glifo, no solo una que pase (mata «decidir por el centro»)', () => {
    for (let hueA = 0; hueA < 360; hueA += 15) {
      for (const gap of [40, 110, 179]) {
        const hueB = (hueA + gap) % 360;
        const ink = inkForHues(hueA, hueB);
        const other = ink === 'light' ? 'dark' : 'light';
        expect({ hueA, hueB, ink, ok: glyphZoneMinContrast(hueA, hueB, ink) >= glyphZoneMinContrast(hueA, hueB, other) }).toEqual({ hueA, hueB, ink, ok: true });
      }
    }
  });

  test('el velo es sutil (α ≤ 0,25) y cubre la caja del glifo entera (radio sólido ≥ diagonal de la caja)', () => {
    expect(GLYPH_VEIL_ALPHA).toBeLessThanOrEqual(0.25);
    expect(GLYPH_HALF_EXTENT).toBeGreaterThanOrEqual(0.15);
    const veil = parseVeil(voiceAvatar('x').veil);
    expect(veil).not.toBeNull();
    expect(veil!.solid).toBeGreaterThanOrEqual(GLYPH_HALF_EXTENT * Math.SQRT2 * 2); // closest-side: 100 % = radio (0,5 del lado)
    expect(veil!.alpha).toBe(GLYPH_VEIL_ALPHA);
  });

  test('VoiceAvatar pinta el velo como capa superior del fondo', () => {
    const src = read('components/crm/agentes/voces/VoiceAvatar.tsx');
    expect(src).toMatch(/background:\s*`\$\{veil\},\s*\$\{gradient\}`/);
  });
});

// ─── BAJA ────────────────────────────────────────────────────────────────────

describe('BAJA · video/webm como alias y «Crear» bloqueado sin can_clone', () => {
  test('video/webm (así etiqueta Chrome un .webm elegido con el selector) se acepta; otros video/* no', () => {
    expect(isAllowedSampleMime('video/webm')).toBe(true);
    expect(isAllowedSampleMime('video/webm;codecs=opus')).toBe(true);
    expect(isAllowedSampleMime('video/mp4')).toBe(false);
    expect(isAllowedSampleMime('video/ogg')).toBe(false);
    expect(isAllowedSampleMime('video/x-matroska')).toBe(false);
  });

  test('ruta: un .webm etiquetado video/webm → 201', async () => {
    const res = await postClone({}, [new CountingFile(64, 'grabacion.webm', 'video/webm', new Uint8Array(64))]);
    expect(res.status).toBe(201);
  });

  test('el asistente deshabilita «Crear mi voz» con can_clone=false y lo explica', () => {
    const wizard = read('components/crm/agentes/voces/CloneVoiceWizard.tsx');
    // Anclado a inicio de línea: una versión comentada («// if (cloneBlocked) return;») no cuenta.
    expect(wizard).toMatch(/^\s*const cloneBlocked = account !== null && !account\.can_clone;$/m);
    expect(wizard).toMatch(/^\s*if \(cloneBlocked\) return;$/m);
    expect(wizard).toMatch(/disabled=\{submitting \|\| cloneBlocked\}/);
    expect(wizard).toMatch(/aria-describedby=\{cloneBlocked \? "clone-blocked-reason" : undefined\}/);
    expect(wizard).toContain('id="clone-blocked-reason"');
  });

  test('ningún componente de la pestaña Voces pasa de 300 líneas', () => {
    const dir = path.join(SRC, 'components', 'crm', 'agentes', 'voces');
    const over = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => ({ f, lines: read(`components/crm/agentes/voces/${f}`).split('\n').length })).filter((x) => x.lines > 300);
    expect(over).toEqual([]);
  });
});
