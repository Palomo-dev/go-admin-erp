/** Supabase falso para pruebas: tablas en memoria, filtros eq/in, update/select/maybeSingle y rpc. */
type Fila = Record<string, unknown>;

export function fakeDb(tablas: Record<string, Fila[]>, rpc: (fn: string, args: Fila) => { data: unknown; error: { message: string } | null }) {
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
      eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; },
      in: (k: string, v: unknown[]) => { filtros.push([k, v]); return q; },
      lte: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: ejecutar(), error: null }).then(ok),
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
