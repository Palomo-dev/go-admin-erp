/**
 * Base Supabase falsa para las pruebas del Frente INT: tablas en memoria, filtros
 * eq/neq/in/is/gte/lte/or(ilike)/order/limit/range (+ count), insert/update/upsert/delete y rpc del Vault. Sin red.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Fila = Record<string, unknown>;

export interface BaseFalsa {
  db: SupabaseClient;
  tablas: Record<string, Fila[]>;
  rpc: jest.Mock;
  /** Secretos de la bóveda por uuid. */
  boveda: Map<string, string>;
}

let secuencia = 0;
export function uuidFalso(prefijo = '1'): string {
  secuencia += 1;
  return `${prefijo.repeat(8)}-${prefijo.repeat(4)}-4${prefijo.repeat(3)}-8${prefijo.repeat(3)}-${String(secuencia).padStart(12, '0')}`;
}

/** Valor de una columna; admite `col->>clave` de jsonb (como texto). */
function valorCol(f: Fila, c: string): unknown {
  const m = /^(\w+)->>(\w+)$/.exec(c);
  if (!m) return f[c];
  const obj = f[m[1]];
  const v = obj && typeof obj === 'object' ? (obj as Fila)[m[2]] : undefined;
  return v == null ? null : String(v);
}

export function crearBaseFalsa(tablas: Record<string, Fila[]> = {}): BaseFalsa {
  const boveda = new Map<string, string>();
  const rpc = jest.fn(async (nombre: string, args: Fila) => {
    if (nombre === 'fn_set_provider_secret') {
      const t = (tablas.integration_credentials ??= []);
      const ref = uuidFalso('4');
      boveda.set(ref, String(args.p_value));
      const previa = t.find((f) => f.connection_id === args.p_connection_id && f.purpose === args.p_purpose);
      const prefijo = String(args.p_value).slice(0, 4) + '...';
      if (previa) Object.assign(previa, { secret_ref: ref, key_prefix: prefijo, status: 'active' });
      else t.push({ id: uuidFalso('5'), connection_id: args.p_connection_id, purpose: args.p_purpose, credential_type: args.p_credential_type ?? 'secret', secret_ref: ref, status: 'active', key_prefix: prefijo });
      return { data: ref, error: null };
    }
    if (nombre === 'fn_get_provider_secret') {
      const fila = (tablas.integration_credentials ?? []).find(
        (f) => f.connection_id === args.p_connection_id && f.purpose === args.p_purpose && f.status === 'active',
      );
      const ref = typeof fila?.secret_ref === 'string' ? fila.secret_ref : '';
      return { data: boveda.get(ref) ?? null, error: null };
    }
    return { data: null, error: { message: `rpc desconocida ${nombre}` } };
  });

  function desde(tabla: string) {
    const filtros: ((f: Fila) => boolean)[] = [];
    type Accion =
      | { tipo: 'select' }
      | { tipo: 'insert'; filas: Fila[] }
      | { tipo: 'update'; cambios: Fila }
      | { tipo: 'delete' }
      | { tipo: 'upsert'; filas: Fila[]; conflicto: string[] };
    let accion: Accion = { tipo: 'select' };
    let limite: number | null = null;
    let rango: { desde: number; hasta: number } | null = null;
    let orden: { col: string; asc: boolean } | null = null;
    let total = 0;
    const filas = () => (tablas[tabla] ??= []);
    const ejecutar = (): Fila[] => {
      if (accion.tipo === 'insert') {
        const nuevas = accion.filas.map((f) => ({ id: uuidFalso('1'), ...f }));
        filas().push(...nuevas);
        return nuevas;
      }
      if (accion.tipo === 'upsert') {
        const conflicto = accion.conflicto;
        return accion.filas.map((f) => {
          const previa = conflicto.length ? filas().find((x) => conflicto.every((c) => x[c] === f[c])) : undefined;
          if (previa) return Object.assign(previa, f);
          const nueva = { id: uuidFalso('1'), ...f };
          filas().push(nueva);
          return nueva;
        });
      }
      let coinciden = filas().filter((f) => filtros.every((p) => p(f)));
      if (accion.tipo === 'update') for (const f of coinciden) Object.assign(f, accion.cambios);
      if (accion.tipo === 'delete') {
        tablas[tabla] = filas().filter((f) => !coinciden.includes(f));
      }
      if (orden) {
        const { col, asc } = orden;
        coinciden = [...coinciden].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      total = coinciden.length;
      if (rango) coinciden = coinciden.slice(rango.desde, rango.hasta + 1);
      return limite == null ? coinciden : coinciden.slice(0, limite);
    };
    const resultado = () => {
      const data = ejecutar();
      return { data, error: null, count: total };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push((f) => valorCol(f, c) === v), q),
      neq: (c: string, v: unknown) => (filtros.push((f) => f[c] !== v), q),
      in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), q),
      is: (c: string, v: unknown) => (filtros.push((f) => (f[c] ?? null) === v), q),
      gte: (c: string, v: unknown) => (filtros.push((f) => String(f[c]) >= String(v)), q),
      lte: (c: string, v: unknown) => (filtros.push((f) => String(f[c]) <= String(v)), q),
      // `or('col.ilike.%x%,otra.ilike.%x%')`: lo mínimo que usa la búsqueda de eventos.
      or: (expr: string) => {
        const partes = expr.split(',').map((p) => /^(\w+)\.ilike\.%(.*)%$/.exec(p)).filter((m): m is RegExpExecArray => !!m);
        filtros.push((f) => partes.some((m) => String(f[m[1]] ?? '').toLowerCase().includes(m[2].toLowerCase())));
        return q;
      },
      range: (desde: number, hasta: number) => ((rango = { desde, hasta }), q),
      order: (col: string, o?: { ascending?: boolean }) => ((orden = { col, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((limite = n), q),
      insert: (f: Fila | Fila[]) => ((accion = { tipo: 'insert', filas: Array.isArray(f) ? f : [f] }), q),
      upsert: (f: Fila | Fila[], o?: { onConflict?: string }) => (
        (accion = { tipo: 'upsert', filas: Array.isArray(f) ? f : [f], conflicto: o?.onConflict ? o.onConflict.split(',') : [] }), q
      ),
      update: (c: Fila) => ((accion = { tipo: 'update', cambios: c }), q),
      delete: () => ((accion = { tipo: 'delete' }), q),
      single: async () => {
        const d = ejecutar();
        return d.length === 1 ? { data: d[0], error: null } : { data: null, error: { message: 'no rows' } };
      },
      maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko),
    };
    return q;
  }

  const db = { from: desde, rpc } as unknown as SupabaseClient;
  return { db, tablas, rpc, boveda };
}
