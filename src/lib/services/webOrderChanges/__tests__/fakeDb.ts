/** Supabase falso para pruebas: tablas en memoria, filtros eq/in, update/select/maybeSingle y rpc. */
type Fila = Record<string, unknown>;

export function fakeDb(
  tablas: Record<string, Fila[]>,
  rpc: (fn: string, args: Fila) => { data: unknown; error: { message: string } | null },
  /** Error forzado por tabla/operación (p. ej. columna inexistente 42703). */
  fallo?: (tabla: string, op: string, valores?: Fila) => { code: string; message: string } | null,
) {
  const llamadas: Array<{ tabla: string; op: string; valores?: Fila; filtros: Array<[string, unknown]> }> = [];
  const desde = (tabla: string) => {
    const filtros: Array<[string, unknown]> = [];
    let op = 'select';
    let valores: Fila | undefined;
    const filas = () =>
      (tablas[tabla] ?? []).filter((f) =>
        filtros.every(([k, v]) => (Array.isArray(v) ? (v as unknown[]).map(String).includes(String(f[k])) : String(f[k]) === String(v))),
      );
    const ejecutar = () => {
      llamadas.push({ tabla, op, valores, filtros: [...filtros] });
      const rs = filas();
      if (op === 'update') rs.forEach((f) => Object.assign(f, valores));
      return rs;
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (v: Fila) => { op = 'update'; valores = v; return q; },
      insert: async (v: Fila) => {
        llamadas.push({ tabla, op: 'insert', valores: v, filtros: [] });
        const e = fallo?.(tabla, 'insert', v) ?? null;
        if (!e) (tablas[tabla] ??= []).push(v);
        return { data: null, error: e };
      },
      eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; },
      in: (k: string, v: unknown[]) => { filtros.push([k, v]); return q; },
      lte: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      then: (ok: (r: { data: Fila[] | null; error: unknown }) => unknown) => {
        const e = fallo?.(tabla, op, valores) ?? null;
        if (e) {
          llamadas.push({ tabla, op, valores, filtros: [...filtros] });
          return Promise.resolve({ data: null, error: e }).then(ok);
        }
        return Promise.resolve({ data: ejecutar(), error: null }).then(ok);
      },
    };
    return q;
  };
  const rpcs: Array<{ fn: string; args: Fila }> = [];
  return {
    llamadas,
    rpcs,
    from: desde,
    rpc: async (fn: string, args: Fila) => { rpcs.push({ fn, args }); return rpc(fn, args); },
  };
}
