/**
 * Doble de Supabase en memoria para las pruebas de envíos programados:
 * select / insert / update / delete con `eq`, `in`, `lte`, `gte`, `contains` y `not is null`,
 * `single` / `maybeSingle` y `.select()` después de escribir. Registra cada
 * escritura para comprobar QUÉ se tocó y con qué filtros.
 */
type Fila = Record<string, unknown>;

export interface Escritura {
  tabla: string;
  op: 'insert' | 'update' | 'delete';
  valores: Fila | null;
  filtros: Array<[string, string, unknown]>;
  afectadas: number;
}

class Consulta implements PromiseLike<{ data: unknown; error: null }> {
  private filtros: Array<[string, string, unknown]> = [];
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private valores: Fila | null = null;
  constructor(private readonly tabla: string, private readonly filas: Fila[], private readonly escrituras: Escritura[]) {}

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  insert(v: Fila) { this.op = 'insert'; this.valores = v; return this; }
  update(v: Fila) { this.op = 'update'; this.valores = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filtros.push([c, 'eq', v]); return this; }
  in(c: string, v: unknown[]) { this.filtros.push([c, 'in', v]); return this; }
  lte(c: string, v: unknown) { this.filtros.push([c, 'lte', v]); return this; }
  gte(c: string, v: unknown) { this.filtros.push([c, 'gte', v]); return this; }
  contains(c: string, v: Record<string, unknown>) { this.filtros.push([c, 'contains', v]); return this; }
  not(c: string, op: string, v: unknown) { this.filtros.push([c, `not.${op}`, v]); return this; }

  private cumple(f: Fila): boolean {
    return this.filtros.every(([c, op, v]) => {
      const x = f[c];
      if (op === 'eq') return String(x) === String(v);
      if (op === 'in') return (v as unknown[]).map(String).includes(String(x));
      if (op === 'lte') return Date.parse(String(x)) <= Date.parse(String(v));
      if (op === 'gte') return Date.parse(String(x)) >= Date.parse(String(v));
      if (op === 'contains') {
        const o = (x ?? {}) as Record<string, unknown>;
        return Object.entries(v as Record<string, unknown>).every(([k, val]) => o[k] === val);
      }
      if (op === 'not.is') return x !== null && x !== undefined;
      return true;
    });
  }

  private ejecutar(): Fila[] {
    if (this.op === 'insert') {
      const fila = { id: `id-${this.filas.length + 1}`, ...this.valores };
      this.filas.push(fila);
      this.escrituras.push({ tabla: this.tabla, op: 'insert', valores: this.valores, filtros: [], afectadas: 1 });
      return [fila];
    }
    const coinciden = this.filas.filter((f) => this.cumple(f));
    if (this.op === 'update') {
      for (const f of coinciden) Object.assign(f, this.valores);
      this.escrituras.push({ tabla: this.tabla, op: 'update', valores: this.valores, filtros: this.filtros, afectadas: coinciden.length });
    } else if (this.op === 'delete') {
      for (const f of coinciden) this.filas.splice(this.filas.indexOf(f), 1);
      this.escrituras.push({ tabla: this.tabla, op: 'delete', valores: null, filtros: this.filtros, afectadas: coinciden.length });
    }
    return coinciden.map((f) => ({ ...f }));
  }

  async maybeSingle() { return { data: this.ejecutar()[0] ?? null, error: null }; }
  async single() {
    const [f] = this.ejecutar();
    return f ? { data: f, error: null } : { data: null, error: { message: 'sin fila' } };
  }
  then<A = { data: unknown; error: null }, B = never>(
    ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
    mal?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve({ data: this.ejecutar() as unknown, error: null as null }).then(ok, mal);
  }
}

export function fakeTablas(tablas: Record<string, Fila[]>, rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const escrituras: Escritura[] = [];
  const llamadas: Array<{ nombre: string; args: Record<string, unknown> }> = [];
  return {
    tablas,
    escrituras,
    llamadas,
    from(tabla: string) {
      return new Consulta(tabla, (tablas[tabla] ??= []), escrituras);
    },
    async rpc(nombre: string, args: Record<string, unknown>) {
      llamadas.push({ nombre, args });
      const fn = rpcs[nombre];
      return fn ? { data: fn(args), error: null } : { data: null, error: null };
    },
  };
}
