/**
 * Almacén local genérico para la lectura offline del Desktop (fase 4C).
 *
 * IndexedDB `goadmin-replica`: un object store por tabla del manifiesto
 * (`replicationManifest.ts`), clave = PK real de la tabla, índice `by_org`
 * sobre `organization_id` (real o añadido localmente) y un índice `by_<col>`
 * por cada columna declarada en `indexes` (FKs más consultadas, `updated_at`,
 * `created_at`). Aquí se guardan FILAS tal como las devuelve PostgREST, no
 * respuestas HTTP: así `postgrestLocal.ts` puede evaluar cualquier consulta
 * (`select`, filtros, `order`, `range`, embeds) sobre ellas, se haya pedido
 * antes o no.
 *
 * Generaliza `catalogStore.ts` (fase 4A): la capa IndexedDB —apertura con
 * versionado, promesas sobre `IDBRequest`/`IDBTransaction`, claves
 * compuestas serializadas, poda por conjunto de claves— vive aquí y
 * `catalogStore.ts` la reutiliza. El catálogo del POS (`goadmin-catalog`)
 * sigue siendo una base aparte porque sus filas son derivadas (favoritos
 * fundidos, una imagen por producto) y `posOfflineReads.ts` depende de esa
 * forma.
 *
 * Solo lectura desde la UI: escribe únicamente `offlineReplicator.ts`.
 * Solo tiene sentido en Desktop; en navegador nada la abre.
 */

import { REPLICATION_MANIFEST, getTableManifest, pkColumns, type TableManifest } from './replicationManifest';

export const OFFLINE_DB_NAME = 'goadmin-replica';
/**
 * Subir cuando cambie el manifiesto (stores o índices nuevos): el
 * `onupgradeneeded` crea lo que falte sin borrar lo existente.
 */
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_META_STORE = 'meta';
/** Clave en `meta` con la organización a la que pertenecen los datos locales. */
const ORG_META_KEY = '__organization__';

export type OfflineRow = Record<string, unknown>;

// ── Capa IndexedDB genérica (la reutiliza catalogStore.ts) ──

/** Separador de claves compuestas (U+241F, símbolo imprimible): no aparece en ids ni códigos. */
export const KEY_SEP = '␟';

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

/** Serializa una clave (simple o compuesta) para compararla en conjuntos. */
export function keyToString(key: IDBValidKey): string {
  return Array.isArray(key) ? key.map(String).join(KEY_SEP) : String(key);
}

/** Clave primaria serializada de una fila según su `keyPath`. */
export function rowKeyOf(keyPath: string | string[], row: OfflineRow): string {
  return Array.isArray(keyPath) ? keyPath.map((k) => String(row[k])).join(KEY_SEP) : String(row[keyPath]);
}

/** Valor de clave IndexedDB de una fila (para `get`). */
export function rowKeyValue(keyPath: string | string[], row: OfflineRow): IDBValidKey {
  return Array.isArray(keyPath) ? (keyPath.map((k) => row[k]) as IDBValidKey[]) : (row[keyPath] as IDBValidKey);
}

export interface IdbStoreDef {
  keyPath: string | string[];
  indexes: Array<{ name: string; keyPath: string | string[] }>;
}

const openPromises = new Map<string, Promise<IDBDatabase>>();

/**
 * Abre (y crea/actualiza) una base IndexedDB con los stores indicados. La
 * promesa se comparte por nombre; se descarta si falla o si otra pestaña
 * pide una versión nueva (`versionchange`).
 */
export function openIdb(name: string, version: number, stores: Record<string, IdbStoreDef>, metaStore = OFFLINE_META_STORE): Promise<IDBDatabase> {
  const existing = openPromises.get(name);
  if (existing) return existing;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`${name} bloqueada por otra pestaña`));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        openPromises.delete(name);
      };
      resolve(db);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      for (const [storeName, def] of Object.entries(stores)) {
        const store = db.objectStoreNames.contains(storeName)
          ? tx!.objectStore(storeName)
          : db.createObjectStore(storeName, { keyPath: def.keyPath });
        for (const idx of def.indexes) {
          if (!store.indexNames.contains(idx.name)) store.createIndex(idx.name, idx.keyPath);
        }
      }
      if (!db.objectStoreNames.contains(metaStore)) db.createObjectStore(metaStore, { keyPath: 'key' });
    };
  });
  openPromises.set(name, promise);
  promise.catch(() => openPromises.delete(name));
  return promise;
}

export async function closeIdb(name: string): Promise<void> {
  const promise = openPromises.get(name);
  if (!promise) return;
  openPromises.delete(name);
  try {
    (await promise).close();
  } catch {
    // ya cerrada
  }
}

// ── Definición de stores a partir del manifiesto ──

export function indexNameFor(column: string): string {
  return column === 'organization_id' ? 'by_org' : `by_${column}`;
}

export function storeDefsFromManifest(manifest: TableManifest[] = REPLICATION_MANIFEST): Record<string, IdbStoreDef> {
  const defs: Record<string, IdbStoreDef> = {};
  for (const m of manifest) {
    const indexes = [{ name: 'by_org', keyPath: 'organization_id' }];
    for (const col of m.indexes) {
      if (col === 'organization_id' || pkColumns(m).length === 1 && pkColumns(m)[0] === col) continue;
      indexes.push({ name: indexNameFor(col), keyPath: col });
    }
    defs[m.table] = { keyPath: m.pk, indexes };
  }
  return defs;
}

function openOfflineDB(): Promise<IDBDatabase> {
  return openIdb(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, storeDefsFromManifest());
}

export function closeOfflineDB(): Promise<void> {
  return closeIdb(OFFLINE_DB_NAME);
}

function manifestOf(table: string): TableManifest {
  const m = getTableManifest(table);
  if (!m) throw new Error(`[offline] La tabla ${table} no está en el manifiesto de replicación`);
  return m;
}

/** true si la columna tiene índice local en `table` (PK simple, `organization_id` o declarada). */
export function hasLocalIndex(table: string, column: string): boolean {
  const m = getTableManifest(table);
  if (!m) return false;
  if (column === 'organization_id') return true;
  const pk = pkColumns(m);
  if (pk.length === 1 && pk[0] === column) return true;
  return m.indexes.includes(column);
}

// ── Escritura (la usa el replicador) ──

export async function putOfflineRows(table: string, rows: OfflineRow[]): Promise<void> {
  if (rows.length === 0) return;
  manifestOf(table);
  const db = await openOfflineDB();
  const tx = db.transaction(table, 'readwrite');
  const os = tx.objectStore(table);
  for (const row of rows) os.put(row);
  await txDone(tx);
}

/**
 * Borra de `table` las filas de la organización cuya PK no esté en
 * `keepKeys` (serializadas con `keyToString`). Se llama al terminar una
 * pasada completa para retirar lo que ya no existe en el servidor o salió
 * de la ventana temporal.
 */
export async function pruneOfflineRows(table: string, organizationId: number, keepKeys: Set<string>): Promise<number> {
  manifestOf(table);
  const db = await openOfflineDB();
  const tx = db.transaction(table, 'readwrite');
  const os = tx.objectStore(table);
  const primaryKeys = await requestToPromise(os.index('by_org').getAllKeys(IDBKeyRange.only(organizationId)));
  let removed = 0;
  for (const key of primaryKeys) {
    if (keepKeys.has(keyToString(key))) continue;
    os.delete(key);
    removed++;
  }
  await txDone(tx);
  return removed;
}

/** Borra filas concretas por clave (ventana temporal en pasadas incrementales). */
export async function deleteOfflineRows(table: string, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openOfflineDB();
  const tx = db.transaction(table, 'readwrite');
  const os = tx.objectStore(table);
  for (const key of keys) os.delete(key);
  await txDone(tx);
}

export async function clearOfflineTable(table: string): Promise<void> {
  const db = await openOfflineDB();
  const tx = db.transaction([table, OFFLINE_META_STORE], 'readwrite');
  tx.objectStore(table).clear();
  const meta = tx.objectStore(OFFLINE_META_STORE);
  const all = (await requestToPromise(meta.getAll())) as OfflineTableMeta[];
  for (const m of all) if (m.table === table) meta.delete(m.key);
  await txDone(tx);
}

/** Vacía toda la réplica (cambio de organización, cierre de sesión, soporte). */
export async function clearOfflineDb(): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await openOfflineDB();
  const names = [...REPLICATION_MANIFEST.map((m) => m.table), OFFLINE_META_STORE];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await txDone(tx);
}

// ── Meta ──

export interface OfflineTableMeta {
  /** `${table}:${organization_id}` */
  key: string;
  table: string;
  organization_id: number;
  /** ms epoch de la última pasada (completa o incremental) sin error. */
  replicated_at: number;
  /** ms epoch de la última pasada completa (con poda). */
  full_at: number;
  /** Filas locales de la organización tras la última pasada. */
  count: number;
  /** Bytes aproximados (longitud del JSON de las filas). */
  bytes: number;
  /** Cursor incremental (último valor de la columna `incremental`), o null. */
  cursor: string | null;
  /** Último error de replicación, o null si la última pasada fue bien. */
  error: string | null;
  /** ms epoch del último intento (con o sin error). */
  attempted_at: number;
}

export async function getOfflineTableMeta(table: string, organizationId: number): Promise<OfflineTableMeta | undefined> {
  const db = await openOfflineDB();
  const tx = db.transaction(OFFLINE_META_STORE, 'readonly');
  return (await requestToPromise(tx.objectStore(OFFLINE_META_STORE).get(`${table}:${organizationId}`))) as OfflineTableMeta | undefined;
}

export async function setOfflineTableMeta(meta: OfflineTableMeta): Promise<void> {
  const db = await openOfflineDB();
  const tx = db.transaction(OFFLINE_META_STORE, 'readwrite');
  tx.objectStore(OFFLINE_META_STORE).put(meta);
  await txDone(tx);
}

/**
 * Garantiza que la réplica pertenece a `organizationId`: si tenía datos de
 * otra organización, la vacía. Devuelve true si hubo que vaciar.
 */
export async function ensureOfflineDbOrganization(organizationId: number): Promise<boolean> {
  const db = await openOfflineDB();
  const tx = db.transaction(OFFLINE_META_STORE, 'readonly');
  const current = (await requestToPromise(tx.objectStore(OFFLINE_META_STORE).get(ORG_META_KEY))) as { key: string; organization_id: number } | undefined;
  if (current && current.organization_id === organizationId) return false;
  if (current) await clearOfflineDb();
  const tx2 = db.transaction(OFFLINE_META_STORE, 'readwrite');
  tx2.objectStore(OFFLINE_META_STORE).put({ key: ORG_META_KEY, organization_id: organizationId });
  await txDone(tx2);
  return current !== undefined;
}

export interface OfflineDbStatus {
  organization_id: number;
  /** true si ninguna tabla se ha replicado nunca para la organización. */
  isEmpty: boolean;
  /** ms epoch de la replicación más antigua entre las tablas replicadas, o null. */
  replicatedAt: number | null;
  /** ms epoch de la replicación más reciente, o null. */
  latestAt: number | null;
  totalRows: number;
  estimatedBytes: number;
  tables: Record<string, OfflineTableMeta>;
  /** Tablas del manifiesto que aún no se replicaron. */
  missing: string[];
}

export async function getOfflineDbStatus(organizationId: number): Promise<OfflineDbStatus> {
  const empty: OfflineDbStatus = {
    organization_id: organizationId, isEmpty: true, replicatedAt: null, latestAt: null, totalRows: 0, estimatedBytes: 0, tables: {},
    missing: REPLICATION_MANIFEST.map((m) => m.table),
  };
  if (!isIndexedDbAvailable()) return empty;
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(OFFLINE_META_STORE, 'readonly');
    const all = (await requestToPromise(tx.objectStore(OFFLINE_META_STORE).getAll())) as Array<OfflineTableMeta | { key: string }>;
    const status: OfflineDbStatus = { ...empty, tables: {}, missing: [] };
    for (const meta of all) {
      if (!('table' in meta) || meta.organization_id !== organizationId) continue;
      status.tables[meta.table] = meta;
      if (meta.replicated_at > 0) {
        status.replicatedAt = status.replicatedAt === null ? meta.replicated_at : Math.min(status.replicatedAt, meta.replicated_at);
        status.latestAt = status.latestAt === null ? meta.replicated_at : Math.max(status.latestAt, meta.replicated_at);
      }
      status.totalRows += meta.count;
      status.estimatedBytes += meta.bytes;
    }
    status.missing = REPLICATION_MANIFEST.map((m) => m.table).filter((t) => !status.tables[t] || status.tables[t].replicated_at === 0);
    status.isEmpty = status.replicatedAt === null;
    return status;
  } catch {
    return empty;
  }
}

/** true si la tabla se replicó alguna vez para la organización (aunque tenga 0 filas). */
export async function isTableReplicated(table: string, organizationId: number): Promise<boolean> {
  if (!isIndexedDbAvailable() || !getTableManifest(table)) return false;
  try {
    const meta = await getOfflineTableMeta(table, organizationId);
    return !!meta && meta.replicated_at > 0;
  } catch {
    return false;
  }
}

// ── Lectura (la usa postgrestLocal) ──

export async function getOfflineRowsByOrg(table: string, organizationId: number): Promise<OfflineRow[]> {
  manifestOf(table);
  const db = await openOfflineDB();
  const tx = db.transaction(table, 'readonly');
  return (await requestToPromise(tx.objectStore(table).index('by_org').getAll(IDBKeyRange.only(organizationId)))) as OfflineRow[];
}

/** Filas cuya columna indexada tome alguno de los valores (una transacción, N peticiones). */
export async function getOfflineRowsByIndex(table: string, column: string, values: IDBValidKey[]): Promise<OfflineRow[]> {
  if (values.length === 0) return [];
  const m = manifestOf(table);
  const db = await openOfflineDB();
  const tx = db.transaction(table, 'readonly');
  const os = tx.objectStore(table);
  const pk = pkColumns(m);
  const isPk = pk.length === 1 && pk[0] === column;
  const requests = values.map((v) =>
    isPk ? requestToPromise(os.get(v)).then((r) => (r ? [r as OfflineRow] : [])) : requestToPromise(os.index(indexNameFor(column)).getAll(IDBKeyRange.only(v))),
  );
  const chunks = (await Promise.all(requests)) as OfflineRow[][];
  return chunks.flat();
}

export async function getOfflineRow(table: string, key: IDBValidKey): Promise<OfflineRow | undefined> {
  manifestOf(table);
  const db = await openOfflineDB();
  const tx = db.transaction(table, 'readonly');
  return (await requestToPromise(tx.objectStore(table).get(key))) as OfflineRow | undefined;
}

/** Claves primarias de la organización (para podas y ventanas). */
export async function getOfflineKeysByOrg(table: string, organizationId: number): Promise<IDBValidKey[]> {
  manifestOf(table);
  const db = await openOfflineDB();
  const tx = db.transaction(table, 'readonly');
  return requestToPromise(tx.objectStore(table).index('by_org').getAllKeys(IDBKeyRange.only(organizationId)));
}

/**
 * Fuente de datos que consume el resolutor PostgREST local. Se abstrae para
 * poder probar el evaluador con fixtures en memoria sin IndexedDB.
 */
export interface LocalDataSource {
  getAll(table: string, organizationId: number): Promise<OfflineRow[]>;
  getByIndex(table: string, column: string, values: IDBValidKey[]): Promise<OfflineRow[]>;
  isReplicated(table: string, organizationId: number): Promise<boolean>;
}

export const indexedDbDataSource: LocalDataSource = {
  getAll: getOfflineRowsByOrg,
  getByIndex: getOfflineRowsByIndex,
  isReplicated: isTableReplicated,
};

/** Fuente en memoria a partir de fixtures `{ tabla: filas[] }` (tests y demos). */
export function memoryDataSource(fixtures: Record<string, OfflineRow[]>, replicated: string[] = Object.keys(fixtures)): LocalDataSource {
  const replicatedSet = new Set(replicated);
  return {
    async getAll(table, organizationId) {
      return (fixtures[table] ?? []).filter((r) => r.organization_id === organizationId);
    },
    async getByIndex(table, column, values) {
      const wanted = new Set(values.map(String));
      return (fixtures[table] ?? []).filter((r) => r[column] !== null && r[column] !== undefined && wanted.has(String(r[column])));
    },
    async isReplicated(table) {
      return replicatedSet.has(table);
    },
  };
}

// ── Organización de la sesión ──

/**
 * Organización de la sesión leída del almacenamiento local del navegador
 * (`currentOrganizationId`, que escribe `guardarOrganizacionActiva`). No
 * importa `useOrganization` para no crear un ciclo con `supabase/config`.
 */
export function getStoredOrganizationId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('currentOrganizationId');
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    const json = window.localStorage.getItem('organizacionActiva');
    if (json) {
      const id = Number((JSON.parse(json) as { id?: unknown }).id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  } catch {
    // sin localStorage
  }
  return null;
}
