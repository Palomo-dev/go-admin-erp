/**
 * Doble mínimo del cliente de Supabase para las pruebas de la cola de
 * facturación electrónica: tablas en memoria, filtros eq/neq/in/is/not y
 * RPC configurables. No es un archivo de pruebas (no termina en .test.ts).
 */

export type Fila = Record<string, unknown>;
export type Tablas = Record<string, Fila[]>;

type Filtro = (fila: Fila) => boolean;

export interface LlamadaRpc {
  nombre: string;
  args: Record<string, unknown>;
}

export function crearDobleSupabase(
  tablas: Tablas,
  rpcs: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { code?: string; message: string } | null }> = {},
  opciones: { errorInsert?: (tabla: string, fila: Fila) => { code: string; message: string } | null } = {},
) {
  const llamadas: LlamadaRpc[] = [];

  function from(tabla: string) {
    const filtros: Filtro[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let payload: Fila | null = null;
    let limite: number | null = null;

    const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((fn) => fn(f)));

    const ejecutar = (): { data: Fila[] | null; error: { code: string; message: string } | null } => {
      if (op === 'insert') {
        const err = opciones.errorInsert?.(tabla, payload as Fila) ?? null;
        if (err) return { data: null, error: err };
        const nueva = { id: `id-${(tablas[tabla]?.length ?? 0) + 1}`, ...(payload as Fila) };
        (tablas[tabla] ??= []).push(nueva);
        return { data: [nueva], error: null };
      }
      let rs = filas();
      if (op === 'update') rs.forEach((f) => Object.assign(f, payload));
      if (limite !== null) rs = rs.slice(0, limite);
      return { data: rs, error: null };
    };

    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filtros.push((f) => String(f[c]) === String(v)), b),
      neq: (c: string, v: unknown) => (filtros.push((f) => String(f[c]) !== String(v)), b),
      in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.map(String).includes(String(f[c]))), b),
      is: (c: string, v: unknown) => (filtros.push((f) => (v === null ? f[c] === null || f[c] === undefined : f[c] === v)), b),
      not: (c: string, operador: string, v: unknown) => {
        if (operador === 'is' && v === null) filtros.push((f) => f[c] !== null && f[c] !== undefined);
        return b;
      },
      order: () => b,
      limit: (n: number) => ((limite = n), b),
      update: (p: Fila) => ((op = 'update'), (payload = p), b),
      insert: (p: Fila) => ((op = 'insert'), (payload = p), b),
      maybeSingle: async () => {
        const r = ejecutar();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      single: async () => {
        const r = ejecutar();
        const fila = r.data?.[0] ?? null;
        return { data: fila, error: r.error ?? (fila ? null : { code: 'PGRST116', message: 'no rows' }) };
      },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, ko),
    };
    return b;
  }

  async function rpc(nombre: string, args: Record<string, unknown>) {
    llamadas.push({ nombre, args });
    const impl = rpcs[nombre];
    if (!impl) return { data: null, error: { message: `rpc ${nombre} no simulada` } };
    const r = impl(args);
    return { data: r.data ?? null, error: r.error ?? null };
  }

  return { from, rpc, llamadas };
}
