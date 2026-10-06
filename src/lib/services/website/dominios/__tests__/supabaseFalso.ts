/**
 * Doble mínimo de un cliente Supabase para probar los servicios de dominios
 * sin red: tablas en memoria, filtros eq/neq/in/is/not-in y escrituras que se
 * registran. Solo lo que usan estos servicios.
 */
type Fila = Record<string, unknown>;

export interface Escritura {
  tabla: string;
  op: 'insert' | 'update' | 'delete';
  valores?: Fila;
  filtros: [string, string, unknown][];
}

export function supabaseFalso(tablas: Record<string, Fila[]>, opciones: { errorInsert?: { code: string; message: string } } = {}) {
  const escrituras: Escritura[] = [];
  let nId = 1;

  function consulta(tabla: string) {
    const filtros: [string, string, unknown][] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let valores: Fila | Fila[] | undefined;
    let limite: number | null = null;
    let modo: 'lista' | 'una' | 'unaOpcional' = 'lista';

    const cumple = (f: Fila) =>
      filtros.every(([c, tipo, v]) => {
        if (tipo === 'eq') return f[c] === v;
        if (tipo === 'neq') return f[c] !== v;
        if (tipo === 'in') return (v as unknown[]).includes(f[c]);
        if (tipo === 'is') return (f[c] ?? null) === v;
        if (tipo === 'notin') return !(v as unknown[]).includes(f[c]);
        return true;
      });

    const ejecutar = () => {
      const datos = tablas[tabla] ?? (tablas[tabla] = []);
      if (op === 'insert') {
        if (opciones.errorInsert) return { data: null, error: opciones.errorInsert };
        const nuevas = (Array.isArray(valores) ? valores : [valores!]).map((v) => ({ id: `nuevo-${nId++}`, ...v }));
        datos.push(...nuevas);
        escrituras.push({ tabla, op, valores: nuevas[0], filtros: [] });
        return { data: modo === 'lista' ? nuevas : nuevas[0], error: null };
      }
      const afectadas = datos.filter(cumple);
      if (op === 'update') {
        for (const f of afectadas) Object.assign(f, valores);
        escrituras.push({ tabla, op, valores: valores as Fila, filtros: [...filtros] });
        return { data: null, error: null };
      }
      if (op === 'delete') {
        tablas[tabla] = datos.filter((f) => !cumple(f));
        escrituras.push({ tabla, op, filtros: [...filtros] });
        return { data: null, error: null };
      }
      const lista = limite === null ? afectadas : afectadas.slice(0, limite);
      if (modo === 'lista') return { data: lista, error: null };
      return { data: lista[0] ?? null, error: null };
    };

    const q = {
      select: () => q,
      insert: (v: Fila | Fila[]) => ((op = 'insert'), (valores = v), q),
      update: (v: Fila) => ((op = 'update'), (valores = v), q),
      delete: () => ((op = 'delete'), q),
      eq: (c: string, v: unknown) => (filtros.push([c, 'eq', v]), q),
      neq: (c: string, v: unknown) => (filtros.push([c, 'neq', v]), q),
      in: (c: string, v: unknown[]) => (filtros.push([c, 'in', v]), q),
      is: (c: string, v: unknown) => (filtros.push([c, 'is', v]), q),
      not: (c: string, _o: string, v: string) => (filtros.push([c, 'notin', v.replace(/[()]/g, '').split(',')]), q),
      limit: (n: number) => ((limite = n), q),
      maybeSingle: () => ((modo = 'unaOpcional'), q),
      single: () => ((modo = 'una'), q),
      then: (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, mal),
    };
    return q;
  }

  return {
    cliente: { from: consulta, rpc: async () => ({ data: true, error: null }) } as never,
    escrituras,
    tablas,
  };
}
