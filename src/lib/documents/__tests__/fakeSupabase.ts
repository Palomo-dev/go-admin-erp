/**
 * Doble mínimo de Supabase para los tests del motor: tablas en memoria con los
 * filtros que usan los cargadores (`eq`, `in`, `not in`, `lt`, `or` con
 * `and(...)`/`.in.(...)`). Las relaciones embebidas se ponen ya resueltas en la
 * fila (`customer`, `items`…): el doble no hace joins. Registra cada consulta
 * para poder comprobar QUÉ se pidió (p. ej. que todo lleve `organization_id`).
 */

type Fila = Record<string, unknown>;

export interface ConsultaRegistrada {
  tabla: string;
  filtros: Array<[string, string, unknown]>;
}

function comparar(valor: unknown, operador: string, esperado: unknown): boolean {
  switch (operador) {
    case 'eq':
      return String(valor) === String(esperado);
    case 'in':
      return (esperado as unknown[]).map(String).includes(String(valor));
    case 'notIn':
      return !(esperado as unknown[]).map(String).includes(String(valor));
    case 'lt':
      return Date.parse(String(valor)) < Date.parse(String(esperado));
    default:
      return true;
  }
}

/** Separa por comas de primer nivel (fuera de paréntesis). */
function partir(expr: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const c of expr) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) {
      partes.push(actual);
      actual = '';
    } else actual += c;
  }
  if (actual) partes.push(actual);
  return partes;
}

function condicion(expr: string): (f: Fila) => boolean {
  if (expr.startsWith('and(')) {
    const partes = partir(expr.slice(4, -1)).map(condicion);
    return (f) => partes.every((p) => p(f));
  }
  const m = /^([a-z_]+)\.(eq|in)\.(.*)$/.exec(expr);
  if (!m) throw new Error(`filtro or no soportado: ${expr}`);
  const [, col, op, val] = m;
  if (op === 'in') {
    const lista = val.replace(/^\(|\)$/g, '').split(',');
    return (f) => lista.includes(String(f[col]));
  }
  return (f) => String(f[col]) === val;
}

class Consulta implements PromiseLike<{ data: unknown; error: null }> {
  private predicados: Array<(f: Fila) => boolean> = [];
  constructor(private readonly filas: Fila[], private readonly registro: ConsultaRegistrada) {}
  private agregar(col: string, op: string, v: unknown) {
    this.registro.filtros.push([col, op, v]);
    this.predicados.push((f) => comparar(f[col], op, v));
    return this;
  }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  eq(col: string, v: unknown) { return this.agregar(col, 'eq', v); }
  in(col: string, v: unknown[]) { return this.agregar(col, 'in', v); }
  lt(col: string, v: unknown) { return this.agregar(col, 'lt', v); }
  not(col: string, op: string, v: string) {
    if (op !== 'in') throw new Error('not soportado solo con in');
    return this.agregar(col, 'notIn', v.replace(/^\(|\)$/g, '').split(','));
  }
  or(expr: string) {
    const partes = partir(expr).map(condicion);
    this.registro.filtros.push(['or', 'or', expr]);
    this.predicados.push((f) => partes.some((p) => p(f)));
    return this;
  }
  private resultado(): Fila[] {
    return this.filas.filter((f) => this.predicados.every((p) => p(f)));
  }
  async maybeSingle() {
    return { data: this.resultado()[0] ?? null, error: null };
  }
  then<A = { data: unknown; error: null }, B = never>(
    ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
    mal?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve({ data: this.resultado(), error: null as null }).then(ok, mal);
  }
}

export function fakeSupabase(tablas: Record<string, Fila[]>, rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const consultas: ConsultaRegistrada[] = [];
  const cliente = {
    consultas,
    from(tabla: string) {
      const registro: ConsultaRegistrada = { tabla, filtros: [] };
      consultas.push(registro);
      return new Consulta(tablas[tabla] ?? [], registro);
    },
    async rpc(nombre: string, args: Record<string, unknown>) {
      const fn = rpcs[nombre];
      if (!fn) return { data: null, error: { message: `rpc ${nombre} no simulada` } };
      return { data: fn(args), error: null };
    },
  };
  return cliente;
}
