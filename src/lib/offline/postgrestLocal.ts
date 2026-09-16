/**
 * Resolutor PostgREST local (fase 4C del Desktop).
 *
 * Convierte una petición `GET /rest/v1/<tabla>?...` (URL + cabeceras
 * `Range`, `Prefer: count=exact`, `Accept: application/vnd.pgrst.object+json`)
 * en un plan (`parsePostgrestRequest`) y lo evalúa sobre las filas
 * replicadas en IndexedDB (`evaluatePlan`), devolviendo una `Response` con
 * la misma forma que daría PostgREST: cuerpo JSON, `Content-Range`, 200/206,
 * 406 con `PGRST116` para `.single()` que no encuentra exactamente una fila.
 *
 * Soporta lo que usan los servicios del ERP:
 *  - `select` con columnas, alias (`alias:col`), casts (`col::text`, se
 *    ignora) y embeds de 1–3 niveles (`customers(name)`,
 *    `sale_items(*, products(name))`, `categories!products_category_id_fkey(name)`,
 *    `parent:categories!parent_id(name)`, `suppliers!inner(name)`) por las FKs
 *    del manifiesto, directas (objeto) e inversas (array).
 *  - Filtros `eq, neq, gt, gte, lt, lte, like, ilike, match, imatch, is, in,
 *    cs, cd, ov, fts/plfts/phfts/wfts`, `like(any|all)`, negación `not.`,
 *    `or=(...)` y `and=(...)` anidados, filtros sobre embeds (`rel.col=eq.x`)
 *    y `rel.order`/`rel.limit`/`rel.offset`.
 *  - `order` (varias columnas, `asc/desc`, `nullsfirst/nullslast`),
 *    `limit`/`offset`/`Range`, `count=exact` (también `planned`/`estimated`,
 *    que aquí son exactos), `HEAD`.
 *
 * NO soporta (lanza `UnsupportedQueryError` y el interceptor cae a la caché
 * por URL y luego a 503): agregados (`count()`, `sum()`), rutas JSON
 * (`data->>k`), spread (`...rel`), operadores de rango (`sl, sr, ...`),
 * `order` por columna embebida, embeds sin FK en el manifiesto o ambiguos.
 *
 * El texto (`fts`) se aproxima: todas las palabras deben aparecer en el
 * valor, sin acentos ni mayúsculas; no hay stemming.
 */

import { getTableManifest, inverseRelations, pkColumns, type ForeignKeySpec, type TableManifest } from './replicationManifest';
import type { LocalDataSource, OfflineRow } from './offlineDb';
import { hasLocalIndex, rowKeyOf } from './offlineDb';

export class UnsupportedQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedQueryError';
  }
}

// ── Plan ──

export interface ColumnNode {
  kind: 'column';
  name: string;
  alias?: string;
}

export interface OrderSpec {
  column: string;
  asc: boolean;
  nullsFirst: boolean;
}

export interface EmbedNode {
  kind: 'embed';
  /** Nombre de la relación tal como viene en el select (tabla o columna FK). */
  name: string;
  alias?: string;
  /** Hint tras `!` (nombre de FK o columna), sin contar `inner`. */
  hint?: string;
  inner: boolean;
  select: SelectItem[];
  filters: FilterNode[];
  order: OrderSpec[];
  limit?: number;
  offset?: number;
}

export type SelectItem = ColumnNode | EmbedNode;

export type FilterOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'match' | 'imatch' | 'is' | 'in' | 'cs' | 'cd' | 'ov'
  | 'fts' | 'plfts' | 'phfts' | 'wfts';

export interface ConditionNode {
  kind: 'cond';
  column: string;
  op: FilterOp;
  /** Valor crudo tal como llegó (ya sin `not.` ni operador). */
  value: string;
  negate: boolean;
  /** `like(any)` / `like(all)`. */
  quantifier?: 'any' | 'all';
}

export interface LogicNode {
  kind: 'logic';
  op: 'and' | 'or';
  negate: boolean;
  children: FilterNode[];
}

export type FilterNode = ConditionNode | LogicNode;

export interface QueryPlan {
  table: string;
  select: SelectItem[];
  filters: FilterNode[];
  order: OrderSpec[];
  limit?: number;
  offset?: number;
  count: boolean;
  single: boolean;
  head: boolean;
}

const KNOWN_OPS = new Set<string>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'match', 'imatch', 'is', 'in', 'cs', 'cd', 'ov', 'fts', 'plfts', 'phfts', 'wfts']);
const UNSUPPORTED_OPS = new Set<string>(['sl', 'sr', 'nxr', 'nxl', 'adj', 'isdistinct']);
const RESERVED_PARAMS = new Set<string>(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

const REST_PATH_RE = /\/rest\/v1\/([A-Za-z0-9_]+)\/?$/;

/** Nombre de la tabla de una URL REST (no RPC), o null. */
export function restTableFromUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (pathname.includes('/rest/v1/rpc/')) return null;
  const m = REST_PATH_RE.exec(pathname);
  return m ? m[1] : null;
}

function headerLookup(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === wanted) return v;
  return undefined;
}

// ── Parser del select ──

class SelectParser {
  private i = 0;
  constructor(private s: string) {}

  parseList(): SelectItem[] {
    const items: SelectItem[] = [];
    if (this.s.length === 0) return items;
    for (;;) {
      items.push(this.parseItem());
      if (this.peek() === ',') {
        this.i++;
        continue;
      }
      break;
    }
    return items;
  }

  private peek(): string {
    return this.s[this.i] ?? '';
  }

  private readToken(): string {
    let out = '';
    if (this.peek() === '"') {
      this.i++;
      while (this.i < this.s.length && this.s[this.i] !== '"') out += this.s[this.i++];
      this.i++;
      return out;
    }
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === ',' || c === '(' || c === ')' || c === ':' || c === '!') break;
      out += c;
      this.i++;
    }
    return out;
  }

  private parseItem(): SelectItem {
    let name = this.readToken();
    let alias: string | undefined;
    if (this.peek() === ':' && this.s[this.i + 1] !== ':') {
      this.i++;
      alias = name;
      name = this.readToken();
    }
    if (name === '' ) throw new UnsupportedQueryError(`select vacío en "${this.s}"`);
    if (name.startsWith('...')) throw new UnsupportedQueryError('spread (...rel) no soportado');
    if (name.includes('->')) throw new UnsupportedQueryError(`ruta JSON no soportada: ${name}`);
    const hints: string[] = [];
    while (this.peek() === '!') {
      this.i++;
      hints.push(this.readToken());
    }
    if (this.peek() === '(') {
      this.i++;
      const select = this.parseList();
      if (this.peek() !== ')') throw new UnsupportedQueryError(`paréntesis sin cerrar en "${this.s}"`);
      this.i++;
      // `count()`, `total.sum()`: agregados, no embeds.
      if (select.length === 0) throw new UnsupportedQueryError(`agregado no soportado: ${name}()`);
      if (this.peek() === ':' && this.s[this.i + 1] === ':') {
        this.i += 2;
        this.readToken();
      }
      const inner = hints.includes('inner');
      const hint = hints.find((h) => h !== 'inner' && h !== 'left');
      return { kind: 'embed', name, alias, hint, inner, select, filters: [], order: [] };
    }
    if (this.peek() === ':' && this.s[this.i + 1] === ':') {
      this.i += 2;
      this.readToken(); // cast: se ignora
    }
    return { kind: 'column', name, alias };
  }
}

export function parseSelect(select: string): SelectItem[] {
  const parser = new SelectParser(select);
  const items = parser.parseList();
  return items;
}

// ── Parser de filtros ──

/** Divide por comas de primer nivel respetando paréntesis, llaves y comillas. */
function splitTopLevel(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== '\\') {
      quoted = !quoted;
      cur += c;
      continue;
    }
    if (!quoted) {
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') depth--;
      else if (c === sep && depth === 0) {
        out.push(cur);
        cur = '';
        continue;
      }
    }
    cur += c;
  }
  if (cur.length > 0 || out.length > 0) out.push(cur);
  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\"/g, '"');
  return t;
}

/** `[not.]op[(any|all|config)].valor` → condición sobre `column`. */
function parseCondition(column: string, raw: string): ConditionNode {
  let rest = raw;
  let negate = false;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  if (dot < 0) throw new UnsupportedQueryError(`filtro sin operador: ${column}=${raw}`);
  let opToken = rest.slice(0, dot);
  const value = rest.slice(dot + 1);
  let quantifier: 'any' | 'all' | undefined;
  const paren = opToken.indexOf('(');
  if (paren >= 0) {
    const arg = opToken.slice(paren + 1, -1);
    opToken = opToken.slice(0, paren);
    if (arg === 'any' || arg === 'all') quantifier = arg;
    // `fts(english)`: la configuración se ignora
  }
  if (UNSUPPORTED_OPS.has(opToken)) throw new UnsupportedQueryError(`operador no soportado: ${opToken}`);
  if (!KNOWN_OPS.has(opToken)) throw new UnsupportedQueryError(`operador desconocido: ${opToken}`);
  if (column.includes('->')) throw new UnsupportedQueryError(`ruta JSON no soportada: ${column}`);
  return { kind: 'cond', column, op: opToken as FilterOp, value, negate, quantifier };
}

/** Expresión dentro de `or=(...)`/`and=(...)`: `col.op.v`, `col.not.op.v`, `and(...)`, `not.or(...)`. */
function parseLogicExpr(expr: string): FilterNode {
  const e = expr.trim();
  let negate = false;
  let body = e;
  if (body.startsWith('not.')) {
    negate = true;
    body = body.slice(4);
  }
  const m = /^(and|or)\((.*)\)$/s.exec(body);
  if (m) {
    return { kind: 'logic', op: m[1] as 'and' | 'or', negate, children: splitTopLevel(m[2]).map(parseLogicExpr) };
  }
  // `col.op.valor`, `col.not.op.valor` (PostgREST) o `not.col.op.valor` (tolerado).
  const segs = body.split('.');
  for (let take = 1; take <= 2 && take < segs.length; take++) {
    const column = segs.slice(0, take).join('.');
    const rest = segs.slice(take).join('.');
    const opTok = rest.startsWith('not.') ? rest.slice(4).split('.')[0] : rest.split('.')[0];
    const bare = opTok.replace(/\(.*\)$/, '');
    if (KNOWN_OPS.has(bare) || UNSUPPORTED_OPS.has(bare)) {
      const cond = parseCondition(column, rest);
      if (negate) cond.negate = !cond.negate;
      return cond;
    }
  }
  throw new UnsupportedQueryError(`expresión lógica no reconocida: ${expr}`);
}

export function parseLogicParam(op: 'and' | 'or', raw: string, negate = false): LogicNode {
  const t = raw.trim();
  if (!t.startsWith('(') || !t.endsWith(')')) throw new UnsupportedQueryError(`${op}= mal formado: ${raw}`);
  return { kind: 'logic', op, negate, children: splitTopLevel(t.slice(1, -1)).map(parseLogicExpr) };
}

function parseOrder(raw: string): OrderSpec[] {
  return splitTopLevel(raw).map((part) => {
    const segs = part.trim().split('.');
    const column = segs[0];
    if (column.includes('(') || column.includes('->')) throw new UnsupportedQueryError(`order no soportado: ${part}`);
    let asc = true;
    let nullsFirst: boolean | null = null;
    for (const s of segs.slice(1)) {
      if (s === 'asc') asc = true;
      else if (s === 'desc') asc = false;
      else if (s === 'nullsfirst') nullsFirst = true;
      else if (s === 'nullslast') nullsFirst = false;
      else throw new UnsupportedQueryError(`order no reconocido: ${part}`);
    }
    // Postgres: ASC → nulos al final; DESC → nulos al principio.
    return { column, asc, nullsFirst: nullsFirst ?? !asc };
  });
}

function findEmbedByPath(items: SelectItem[], path: string[]): EmbedNode | null {
  let current = items;
  let found: EmbedNode | null = null;
  for (const seg of path) {
    found = (current.find((it) => it.kind === 'embed' && ((it.alias ?? it.name) === seg || it.name === seg)) as EmbedNode | undefined) ?? null;
    if (!found) return null;
    current = found.select;
  }
  return found;
}

/**
 * Parsea la petición. Lanza `UnsupportedQueryError` si algo no se puede
 * evaluar localmente (el interceptor entonces cae a la caché por URL).
 */
export function parsePostgrestRequest(args: { url: string; method?: string; headers?: Record<string, string> }): QueryPlan {
  const { url, headers } = args;
  const method = (args.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') throw new UnsupportedQueryError(`método ${method} no es una lectura`);
  const table = restTableFromUrl(url);
  if (!table) throw new UnsupportedQueryError('URL no es una tabla REST');
  const params = new URL(url).searchParams;

  const select = parseSelect(params.get('select') ?? '*');
  const plan: QueryPlan = { table, select, filters: [], order: [], count: false, single: false, head: method === 'HEAD' };

  for (const [key, value] of params.entries()) {
    if (key === 'select') continue;
    if (key === 'order') {
      plan.order = parseOrder(value);
      continue;
    }
    if (key === 'limit') {
      plan.limit = Number(value);
      continue;
    }
    if (key === 'offset') {
      plan.offset = Number(value);
      continue;
    }
    if (RESERVED_PARAMS.has(key)) continue;
    if (key === 'or' || key === 'and') {
      plan.filters.push(parseLogicParam(key, value));
      continue;
    }
    if (key.includes('.')) {
      // Parámetro sobre un embed: `rel.col=...`, `rel.order=...`, `rel.limit`, `rel.offset`, `rel.or`.
      const segs = key.split('.');
      const last = segs[segs.length - 1];
      const path = segs.slice(0, -1);
      const embed = findEmbedByPath(select, path);
      if (!embed) throw new UnsupportedQueryError(`filtro sobre relación no seleccionada: ${key}`);
      if (last === 'order') embed.order = parseOrder(value);
      else if (last === 'limit') embed.limit = Number(value);
      else if (last === 'offset') embed.offset = Number(value);
      else if (last === 'or' || last === 'and') embed.filters.push(parseLogicParam(last, value));
      else embed.filters.push(parseCondition(last, value));
      continue;
    }
    plan.filters.push(parseCondition(key, value));
  }

  const range = headerLookup(headers, 'Range');
  if (range && plan.limit === undefined && plan.offset === undefined) {
    const m = /^(\d+)-(\d+)?$/.exec(range.trim());
    if (m) {
      plan.offset = Number(m[1]);
      if (m[2] !== undefined) plan.limit = Number(m[2]) - Number(m[1]) + 1;
    }
  }
  const prefer = headerLookup(headers, 'Prefer') ?? '';
  plan.count = /count=(exact|planned|estimated)/.test(prefer);
  const accept = headerLookup(headers, 'Accept') ?? '';
  plan.single = accept.includes('application/vnd.pgrst.object+json');
  return plan;
}

// ── Evaluación ──

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function isDateLike(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v);
}

/** Convierte el valor textual del filtro al tipo del valor de la fila. */
function coerce(filter: string, sample: unknown): unknown {
  if (typeof sample === 'number') {
    const n = Number(filter);
    return Number.isNaN(n) ? filter : n;
  }
  if (typeof sample === 'boolean') return filter === 'true';
  return filter;
}

/** Comparación total: números, booleanos, fechas ISO y texto. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (isDateLike(a) && isDateLike(b)) {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  }
  const sa = String(a);
  const sb = String(b);
  const byLocale = sa.localeCompare(sb, 'es');
  return byLocale !== 0 ? byLocale : sa < sb ? -1 : sa > sb ? 1 : 0;
}

function likeToRegex(pattern: string, caseInsensitive: boolean): RegExp {
  const escaped = pattern
    .replace(/\*/g, '%')
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, caseInsensitive ? 'is' : 's');
}

function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function parseInList(value: string): string[] {
  const t = value.trim();
  const inner = t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1) : t;
  if (inner.trim() === '') return [];
  return splitTopLevel(inner).map(unquote);
}

function parseArrayLiteral(value: string): unknown {
  const t = value.trim();
  if (t.startsWith('{') && t.endsWith('}')) {
    if (t.includes(':') && t.includes('"')) {
      try {
        return JSON.parse(t);
      } catch {
        // literal de array con comillas
      }
    }
    return t === '{}' ? [] : splitTopLevel(t.slice(1, -1)).map(unquote);
  }
  if (t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch {
      return [];
    }
  }
  return [t];
}

function toArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function arrayIncludesAll(container: unknown[], needles: unknown[]): boolean {
  const set = new Set(container.map(String));
  return needles.every((n) => set.has(String(n)));
}

function jsonContains(container: unknown, needle: unknown): boolean {
  if (Array.isArray(needle)) {
    const arr = toArray(container);
    return arr !== null && needle.every((n) => arr.some((c) => jsonContains(c, n)));
  }
  if (needle !== null && typeof needle === 'object') {
    if (container === null || typeof container !== 'object' || Array.isArray(container)) return false;
    const c = container as Record<string, unknown>;
    return Object.entries(needle as Record<string, unknown>).every(([k, v]) => k in c && jsonContains(c[k], v));
  }
  return String(container) === String(needle);
}

function evalCondition(row: OfflineRow, cond: ConditionNode): boolean {
  const v = row[cond.column];
  const isNull = v === null || v === undefined;
  let result: boolean;
  switch (cond.op) {
    case 'is': {
      const target = cond.value.toLowerCase();
      if (target === 'null') result = isNull;
      else if (target === 'not_null') result = !isNull;
      else if (target === 'true') result = v === true;
      else if (target === 'false') result = v === false;
      else if (target === 'unknown') result = isNull;
      else throw new UnsupportedQueryError(`is.${cond.value} no soportado`);
      break;
    }
    case 'eq':
      result = !isNull && compare(v, coerce(cond.value, v)) === 0;
      break;
    case 'neq':
      result = !isNull && compare(v, coerce(cond.value, v)) !== 0;
      break;
    case 'gt':
      result = !isNull && compare(v, coerce(cond.value, v)) > 0;
      break;
    case 'gte':
      result = !isNull && compare(v, coerce(cond.value, v)) >= 0;
      break;
    case 'lt':
      result = !isNull && compare(v, coerce(cond.value, v)) < 0;
      break;
    case 'lte':
      result = !isNull && compare(v, coerce(cond.value, v)) <= 0;
      break;
    case 'in': {
      const list = parseInList(cond.value);
      result = !isNull && list.some((item) => compare(v, coerce(item, v)) === 0);
      break;
    }
    case 'like':
    case 'ilike': {
      const ci = cond.op === 'ilike';
      if (isNull) {
        result = false;
        break;
      }
      const text = String(v);
      if (cond.quantifier) {
        const patterns = parseArrayLiteral(cond.value) as string[];
        const tests = patterns.map((p) => likeToRegex(String(p), ci).test(text));
        result = cond.quantifier === 'any' ? tests.some(Boolean) : tests.every(Boolean);
      } else {
        result = likeToRegex(cond.value, ci).test(text);
      }
      break;
    }
    case 'match':
    case 'imatch':
      result = !isNull && new RegExp(cond.value, cond.op === 'imatch' ? 'i' : '').test(String(v));
      break;
    case 'cs': {
      const needle = parseArrayLiteral(cond.value);
      result = !isNull && (Array.isArray(needle) && Array.isArray(v) ? arrayIncludesAll(v, needle) : jsonContains(v, needle));
      break;
    }
    case 'cd': {
      const container = parseArrayLiteral(cond.value);
      result = !isNull && (Array.isArray(container) && Array.isArray(v) ? arrayIncludesAll(container, v) : jsonContains(container, v));
      break;
    }
    case 'ov': {
      const other = parseArrayLiteral(cond.value);
      const arr = toArray(v);
      result = arr !== null && Array.isArray(other) && other.some((o) => arr.some((x) => String(x) === String(o)));
      break;
    }
    case 'fts':
    case 'plfts':
    case 'phfts':
    case 'wfts': {
      if (isNull) {
        result = false;
        break;
      }
      const haystack = normalizeText(String(v));
      const words = normalizeText(cond.value).replace(/['"]/g, '').split(/[\s&|:*]+/).filter(Boolean);
      result = words.length > 0 && words.every((w) => haystack.includes(w));
      break;
    }
    default:
      throw new UnsupportedQueryError(`operador no soportado: ${String(cond.op)}`);
  }
  return cond.negate ? !result : result;
}

export function evalFilter(row: OfflineRow, node: FilterNode): boolean {
  if (node.kind === 'cond') return evalCondition(row, node);
  const results = node.children.map((c) => evalFilter(row, c));
  const r = node.op === 'and' ? results.every(Boolean) : results.some(Boolean);
  return node.negate ? !r : r;
}

export function matchesAll(row: OfflineRow, filters: FilterNode[]): boolean {
  return filters.every((f) => evalFilter(row, f));
}

export function sortRows(rows: OfflineRow[], order: OrderSpec[]): OfflineRow[] {
  if (order.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const spec of order) {
      const va = a[spec.column];
      const vb = b[spec.column];
      const na = va === null || va === undefined;
      const nb = vb === null || vb === undefined;
      if (na && nb) continue;
      if (na) return spec.nullsFirst ? -1 : 1;
      if (nb) return spec.nullsFirst ? 1 : -1;
      const c = compare(va, vb);
      if (c !== 0) return spec.asc ? c : -c;
    }
    return 0;
  });
}

interface ResolvedRelation {
  kind: 'direct' | 'inverse';
  childTable: string;
  /** Columna del padre (directa) o del hijo (inversa) que lleva la FK. */
  fkColumn: string;
  /** Columna referenciada (directa: en el hijo; inversa: en el padre). */
  refColumn: string;
}

/**
 * Resuelve qué relación del manifiesto representa el embed `node` desde
 * `parent`. Directas: FK del padre cuya tabla (o nombre/columna, si hay
 * hint) coincide. Inversas: FK de otra tabla hacia el padre.
 */
export function resolveRelation(parent: TableManifest, node: EmbedNode): ResolvedRelation {
  const hint = node.hint;
  const matchHint = (fk: ForeignKeySpec) => !hint || fk.name === hint || fk.column === hint;
  const direct = parent.fks.filter((fk) => (fk.table === node.name || fk.column === node.name) && matchHint(fk) && getTableManifest(fk.table));
  const inverse = inverseRelations(parent.table).filter((r) => r.fromTable === node.name && matchHint(r.fk));
  // Sin hint, varias candidatas (en cualquier dirección) es ambiguo, como en
  // PostgREST. Con hint que casa en ambas direcciones (autorreferencia) se
  // prefiere la directa (muchos-a-uno), que es lo que usan las pantallas.
  const ambiguous = hint ? direct.length > 1 || (direct.length === 0 && inverse.length > 1) : direct.length + inverse.length > 1;
  if (ambiguous) throw new UnsupportedQueryError(`relación ambigua ${parent.table} → ${node.name}: indica la FK con !`);
  if (direct.length === 1) {
    const fk = direct[0];
    return { kind: 'direct', childTable: fk.table, fkColumn: fk.column, refColumn: fk.refColumn ?? 'id' };
  }
  if (inverse.length === 1) {
    const { fromTable, fk } = inverse[0];
    return { kind: 'inverse', childTable: fromTable, fkColumn: fk.column, refColumn: fk.refColumn ?? 'id' };
  }
  throw new UnsupportedQueryError(`sin FK en el manifiesto para embeber ${node.name} desde ${parent.table}`);
}

/** Columnas a proyectar: `*` se expande a las del manifiesto. */
function projectRow(row: OfflineRow, select: SelectItem[], manifest: TableManifest, embedded: Map<EmbedNode, unknown>): OfflineRow {
  const out: OfflineRow = {};
  for (const item of select) {
    if (item.kind === 'column') {
      if (item.name === '*') {
        for (const col of manifest.columns) out[col] = row[col] ?? null;
      } else {
        out[item.alias ?? item.name] = row[item.name] ?? null;
      }
    } else {
      out[item.alias ?? item.name] = embedded.get(item) ?? null;
    }
  }
  return out;
}

const MAX_EMBED_DEPTH = 3;

/**
 * Resuelve los embeds de `select` para `rows` (filas ya filtradas de
 * `manifest`). Devuelve, por fila, el valor de cada embed; si un embed es
 * `!inner`, las filas sin correspondencia se marcan para descartar.
 */
async function resolveEmbeds(
  rows: OfflineRow[],
  select: SelectItem[],
  manifest: TableManifest,
  source: LocalDataSource,
  organizationId: number,
  depth: number,
): Promise<{ values: Map<OfflineRow, Map<EmbedNode, unknown>>; keep: Set<OfflineRow> }> {
  const values = new Map<OfflineRow, Map<EmbedNode, unknown>>();
  const keep = new Set<OfflineRow>(rows);
  for (const row of rows) values.set(row, new Map());
  const embeds = select.filter((it): it is EmbedNode => it.kind === 'embed');
  if (embeds.length === 0 || rows.length === 0) return { values, keep };
  if (depth > MAX_EMBED_DEPTH) throw new UnsupportedQueryError('embeds anidados más de 3 niveles');

  for (const node of embeds) {
    const rel = resolveRelation(manifest, node);
    const childManifest = getTableManifest(rel.childTable)!;
    if (!(await source.isReplicated(rel.childTable, organizationId))) {
      throw new UnsupportedQueryError(`la tabla ${rel.childTable} aún no está replicada`);
    }
    const lookupColumn = rel.kind === 'direct' ? rel.refColumn : rel.fkColumn;
    const keyColumnOnParent = rel.kind === 'direct' ? rel.fkColumn : rel.refColumn;
    const keys = [...new Set(rows.map((r) => r[keyColumnOnParent]).filter((k) => k !== null && k !== undefined))] as IDBValidKey[];
    let children: OfflineRow[];
    if (keys.length === 0) children = [];
    else if (hasLocalIndex(rel.childTable, lookupColumn)) children = await source.getByIndex(rel.childTable, lookupColumn, keys);
    else {
      const wanted = new Set(keys.map(String));
      children = (await source.getAll(rel.childTable, organizationId)).filter((c) => wanted.has(String(c[lookupColumn])));
    }
    children = children.filter((c) => c.organization_id === organizationId && matchesAll(c, node.filters));

    // Embeds anidados del hijo.
    const nested = await resolveEmbeds(children, node.select, childManifest, source, organizationId, depth + 1);
    children = children.filter((c) => nested.keep.has(c));
    children = sortRows(children, node.order);

    const byKey = new Map<string, OfflineRow[]>();
    for (const c of children) {
      const k = String(c[lookupColumn]);
      const bucket = byKey.get(k);
      if (bucket) bucket.push(c);
      else byKey.set(k, [c]);
    }

    for (const row of rows) {
      const k = row[keyColumnOnParent];
      let bucket = k === null || k === undefined ? [] : byKey.get(String(k)) ?? [];
      if (rel.kind === 'inverse' && (node.offset !== undefined || node.limit !== undefined)) {
        const from = node.offset ?? 0;
        bucket = bucket.slice(from, node.limit !== undefined ? from + node.limit : undefined);
      }
      const projected = bucket.map((c) => projectRow(c, node.select, childManifest, nested.values.get(c) ?? new Map()));
      const value: unknown = rel.kind === 'direct' ? projected[0] ?? null : projected;
      values.get(row)!.set(node, value);
      if (node.inner && (rel.kind === 'direct' ? value === null : projected.length === 0)) keep.delete(row);
    }
  }
  return { values, keep };
}

export interface LocalResult {
  status: number;
  body: string | null;
  headers: Record<string, string>;
}

function isSimpleCondOn(node: FilterNode, ops: FilterOp[]): node is ConditionNode {
  return node.kind === 'cond' && !node.negate && ops.includes(node.op) && !node.quantifier;
}

/**
 * Evalúa el plan sobre la fuente local. Lanza `UnsupportedQueryError` si no
 * puede (tabla sin replicar, relación desconocida); devuelve la respuesta
 * PostgREST equivalente si puede.
 */
export async function evaluatePlan(plan: QueryPlan, organizationId: number, source: LocalDataSource): Promise<LocalResult> {
  const manifest = getTableManifest(plan.table);
  if (!manifest) throw new UnsupportedQueryError(`tabla ${plan.table} fuera del manifiesto`);
  if (!(await source.isReplicated(plan.table, organizationId))) throw new UnsupportedQueryError(`tabla ${plan.table} aún no replicada`);

  // Camino de acceso: PK o columna indexada con eq/in en el nivel superior.
  let rows: OfflineRow[] | null = null;
  const pk = pkColumns(manifest);
  const candidates = plan.filters.filter((f) => isSimpleCondOn(f, ['eq', 'in'])) as ConditionNode[];
  const ranked = [...candidates].sort((a, b) => Number(pk.length === 1 && pk[0] === b.column) - Number(pk.length === 1 && pk[0] === a.column));
  for (const cond of ranked) {
    if (cond.column === 'organization_id' || !hasLocalIndex(plan.table, cond.column)) continue;
    const raw = cond.op === 'eq' ? [cond.value] : parseInList(cond.value);
    const keys: IDBValidKey[] = [];
    for (const v of raw) {
      keys.push(v);
      const n = Number(v);
      if (v !== '' && !Number.isNaN(n) && String(n) === v) keys.push(n);
    }
    rows = await source.getByIndex(plan.table, cond.column, keys);
    // Claves repetidas (`in.(1,1)`, '5' y 5) no deben duplicar filas.
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      const k = rowKeyOf(manifest.pk, r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    break;
  }
  if (rows === null) rows = await source.getAll(plan.table, organizationId);

  let filtered = rows.filter((r) => r.organization_id === organizationId && matchesAll(r, plan.filters));

  const hasInner = plan.select.some((it) => it.kind === 'embed' && it.inner);
  let embedded: Map<OfflineRow, Map<EmbedNode, unknown>> | null = null;
  if (hasInner) {
    const resolved = await resolveEmbeds(filtered, plan.select, manifest, source, organizationId, 1);
    filtered = filtered.filter((r) => resolved.keep.has(r));
    embedded = resolved.values;
  }

  const ordered = sortRows(filtered, plan.order);
  const total = ordered.length;
  const offset = plan.offset ?? 0;
  const page = ordered.slice(offset, plan.limit !== undefined ? offset + plan.limit : undefined);

  if (!embedded) {
    const resolved = await resolveEmbeds(page, plan.select, manifest, source, organizationId, 1);
    embedded = resolved.values;
  }
  const output = page.map((r) => {
    const projected = projectRow(r, plan.select, manifest, embedded!.get(r) ?? new Map());
    if (!manifest.hasOrganizationId) delete projected.organization_id;
    return projected;
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Offline-Local': 'true' };

  if (plan.single) {
    if (output.length !== 1) {
      return {
        status: 406,
        body: JSON.stringify({
          code: 'PGRST116',
          details: `The result contains ${output.length} rows`,
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned',
        }),
        headers,
      };
    }
    headers['Content-Type'] = 'application/vnd.pgrst.object+json';
    headers['Content-Range'] = `0-0/${plan.count ? total : '*'}`;
    return { status: 200, body: plan.head ? null : JSON.stringify(output[0]), headers };
  }

  const countPart = plan.count ? String(total) : '*';
  const rangePart = output.length === 0 ? '*' : `${offset}-${offset + output.length - 1}`;
  headers['Content-Range'] = `${rangePart}/${countPart}`;
  const partial = total > 0 && (offset > 0 || offset + output.length < total);
  return { status: partial ? 206 : 200, body: plan.head ? null : JSON.stringify(output), headers };
}

/**
 * Atajo: URL + cabeceras → `Response` local, o `null` si la petición no se
 * puede resolver localmente (tabla fuera del manifiesto o sin replicar,
 * sintaxis no soportada). Nunca lanza: el interceptor decide el siguiente
 * paso (caché por URL, 503).
 */
export async function resolveLocalPostgrest(
  args: { url: string; method?: string; headers?: Record<string, string> },
  organizationId: number,
  source: LocalDataSource,
): Promise<Response | null> {
  let plan: QueryPlan;
  try {
    plan = parsePostgrestRequest(args);
  } catch (err) {
    if (err instanceof UnsupportedQueryError) return null;
    throw err;
  }
  if (!getTableManifest(plan.table)) return null;
  try {
    const result = await evaluatePlan(plan, organizationId, source);
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch (err) {
    if (err instanceof UnsupportedQueryError) {
      if (typeof console !== 'undefined') console.warn(`[offline] ${plan.table}: ${err.message}; se usa la caché por URL`);
      return null;
    }
    throw err;
  }
}
