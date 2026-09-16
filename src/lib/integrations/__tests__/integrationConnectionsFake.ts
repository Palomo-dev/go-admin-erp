/// <reference types="jest" />
/**
 * Doble mínimo de PostgREST para las pruebas de contrato de los webhooks que
 * buscan su conexión en `integration_connections`.
 *
 * No es un mock complaciente: EVALÚA los `.eq()` / `.in()` sobre las filas del
 * fixture, así que un filtro por un estado que no existe en el CHECK (el bug
 * `eq('status', 'active')`) devuelve cero filas aquí igual que en producción.
 * También valida que el `select()` solo pida columnas reales de la tabla.
 *
 * Columnas y CHECK verificados por MCP de Supabase el 2026-09-15.
 */

import { INTEGRATION_CONNECTION_STATUSES, type IntegrationConnectionStatus } from '../connectionStatus';

/** Columnas reales de `public.integration_connections` (information_schema, 2026-09-15). */
export const INTEGRATION_CONNECTIONS_COLUMNS = [
  'id', 'organization_id', 'connector_id', 'branch_id', 'name', 'environment', 'country_code',
  'status', 'settings', 'last_health_check_at', 'last_error_at', 'last_error_message',
  'error_count_24h', 'connected_at', 'last_activity_at', 'created_at', 'updated_at', 'created_by',
] as const;

export type ConnectionRow = {
  id: string;
  organization_id: number;
  status: string;
  environment: 'production' | 'sandbox' | 'test';
  /** Embed `integration_connectors!inner(...)` tal como lo devuelve PostgREST para una FK simple: objeto, no array. */
  integration_connectors: {
    code: string;
    provider_id: number;
    integration_providers: { code: string };
  };
};

/** Id determinista por estado: `conn-<estado>` (y `conn-<estado>-org<N>` si se pasa la organización). */
export function connectionId(status: string, organizationId?: number): string {
  return organizationId == null ? `conn-${status}` : `conn-${status}-org${organizationId}`;
}

/**
 * Una fila por cada valor real del CHECK, más una con `'active'`.
 *
 * `'active'` no puede existir en la BD (lo rechaza el CHECK); está en el fixture
 * para que la prueba distinga la consulta correcta de la antigua: si la ruta
 * filtrara por `'active'`, encontraría `conn-active` y no `conn-connected`.
 */
export function connectionFixture(
  providerCode: string,
  connectorCode: string,
  organizationId = 120,
  withOrgSuffix = false,
): ConnectionRow[] {
  const statuses: string[] = [...INTEGRATION_CONNECTION_STATUSES, 'active'];
  return statuses.map((status) => ({
    id: connectionId(status, withOrgSuffix ? organizationId : undefined),
    organization_id: organizationId,
    status,
    environment: 'production',
    integration_connectors: { code: connectorCode, provider_id: 1, integration_providers: { code: providerCode } },
  }));
}

/** Estados del CHECK que NO deben encontrarse (todos menos `connected`). */
export const NON_USABLE_STATUSES: IntegrationConnectionStatus[] = INTEGRATION_CONNECTION_STATUSES.filter((s) => s !== 'connected');

/** Separa un select de PostgREST por comas de primer nivel (respeta paréntesis). */
function splitTopLevel(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type PostgrestError = { code: string; message: string };
type Result<T> = { data: T; error: PostgrestError | null };

export type AdminFake = {
  from(table: string): unknown;
  /** Cada `insert()` recibido, con su tabla y payload. */
  inserts: Array<{ table: string; payload: Row }>;
  /** Cada `select()` sobre `integration_connections`. */
  connectionSelects: string[];
};

/**
 * Crea el doble. `tables` mapea nombre de tabla → filas; las tablas ausentes
 * devuelven `[]` (y `null` en `.single()`/`.maybeSingle()`).
 */
export function makeAdminFake(tables: Record<string, Row[]>): AdminFake {
  const inserts: AdminFake['inserts'] = [];
  const connectionSelects: string[] = [];

  function from(table: string) {
    const rows = tables[table] ?? [];
    let error: PostgrestError | null = null;
    const predicates: Predicate[] = [];

    const run = (): Result<Row[]> => {
      if (error) return { data: [], error };
      return { data: rows.filter((r) => predicates.every((p) => p(r))), error: null };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select(select: string) {
        if (table === 'integration_connections') {
          connectionSelects.push(select);
          for (const field of splitTopLevel(select)) {
            if (field.includes('(')) continue; // embed (relación), no columna
            if (!(INTEGRATION_CONNECTIONS_COLUMNS as readonly string[]).includes(field)) {
              error = { code: '42703', message: `column ${table}.${field} does not exist` };
            }
          }
        }
        return builder;
      },
      eq(col: string, val: unknown) {
        predicates.push((row) => String(row[col]) === String(val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        const set = new Set(vals.map(String));
        predicates.push((row) => set.has(String(row[col])));
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      insert(payload: Row) {
        inserts.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: async (): Promise<Result<Row | null>> => {
        const r = run();
        return { data: r.data[0] ?? null, error: r.error };
      },
      single: async (): Promise<Result<Row | null>> => {
        const r = run();
        return { data: r.data[0] ?? null, error: r.error };
      },
      // Las rutas hacen `await ...eq(...)` sin terminador: el builder es thenable.
      then<T>(resolve: (v: Result<Row[]>) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return builder;
  }

  return { from, inserts, connectionSelects };
}
