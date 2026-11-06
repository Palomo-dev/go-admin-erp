/**
 * Supabase falso para las pruebas de pedidos manuales y reconstrucción: tablas en memoria con
 * eq/neq/in/is, insert→select→single (asigna id y created_at), update, delete y rpc.
 */
type Fila = Record<string, unknown>;

export function fakeDbPedidos(tablas: Record<string, Fila[]>, rpc: (fn: string, args: Fila) => { data: unknown; error: { message: string } | null } = () => ({ data: { ok: true }, error: null })) {
  let secuencia = 0;
  const escrituras: Array<{ tabla: string; op: 'insert' | 'update' | 'delete'; valores?: unknown; filtros: Array<[string, string, unknown]> }> = [];
  const rpcs: Array<{ fn: string; args: Fila }> = [];
  const desde = (tabla: string) => {
    const filtros: Array<[string, string, unknown]> = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let valores: Fila | Fila[] | undefined;
    const cumple = (f: Fila) =>
      filtros.every(([tipo, k, v]) => {
        if (tipo === 'eq') return String(f[k]) === String(v);
        if (tipo === 'neq') return String(f[k]) !== String(v);
        if (tipo === 'in') return (v as unknown[]).map(String).includes(String(f[k]));
        if (tipo === 'is') return (f[k] ?? null) === v;
        return true;
      });
    const ejecutar = (): Fila[] => {
      if (op === 'insert') {
        const lista = (Array.isArray(valores) ? valores : [valores]) as Fila[];
        const creadas = lista.map((v) => ({ id: v.id ?? `${tabla}-${++secuencia}`, created_at: new Date(Date.now() + secuencia).toISOString(), ...v }));
        (tablas[tabla] ??= []).push(...creadas);
        escrituras.push({ tabla, op, valores: creadas, filtros: [] });
        return creadas;
      }
      const rs = (tablas[tabla] ?? []).filter(cumple);
      if (op === 'update') {
        rs.forEach((f) => Object.assign(f, valores));
        escrituras.push({ tabla, op, valores, filtros: [...filtros] });
      }
      if (op === 'delete') {
        tablas[tabla] = (tablas[tabla] ?? []).filter((f) => !rs.includes(f));
        escrituras.push({ tabla, op, filtros: [...filtros] });
      }
      return rs;
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (v: Fila | Fila[]) => { op = 'insert'; valores = v; return q; },
      update: (v: Fila) => { op = 'update'; valores = v; return q; },
      delete: () => { op = 'delete'; return q; },
      eq: (k: string, v: unknown) => { filtros.push(['eq', k, v]); return q; },
      neq: (k: string, v: unknown) => { filtros.push(['neq', k, v]); return q; },
      in: (k: string, v: unknown[]) => { filtros.push(['in', k, v]); return q; },
      is: (k: string, v: unknown) => { filtros.push(['is', k, v]); return q; },
      gte: () => q,
      lte: () => q,
      order: () => q,
      limit: () => q,
      single: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      then: (ok: (r: { data: Fila[] | null; error: unknown }) => unknown) => Promise.resolve({ data: ejecutar(), error: null }).then(ok),
    };
    return q;
  };
  return {
    tablas,
    escrituras,
    rpcs,
    from: desde,
    rpc: async (fn: string, args: Fila) => { rpcs.push({ fn, args }); return rpc(fn, args); },
  };
}
