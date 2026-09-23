// ============================================================================
// Doble del cliente de Supabase para las pruebas de zona horaria (Fase B).
//
// NO es un mock "que devuelva algo": lo que estas pruebas necesitan verificar
// es EXACTAMENTE QUE VALOR SE ESCRIBE o CON QUE EXTREMOS SE FILTRA. Un día de
// diferencia en `due_date` es un vencimiento distinto, y un rango sin offset es
// una jornada corrida. Por eso el doble registra cada llamada: tabla,
// operación, payload y filtros.
//
// El constructor encadenable de PostgREST devuelve siempre `this`, y la promesa
// se resuelve al hacer `await`. Se reproduce igual: cualquier método de filtro
// devuelve el mismo objeto, y `then` entrega la respuesta preparada.
// ============================================================================

export interface LlamadaRegistrada {
  tabla: string;
  operacion: 'select' | 'insert' | 'update' | 'delete';
  payload: unknown;
  filtros: Array<{ metodo: string; columna: string; valor: unknown }>;
}

/**
 * Constructor de consulta encadenable. Los metodos de filtro (`eq`, `gte`, ...)
 * se instalan en bucle, por eso la firma indexada: son todos iguales.
 */
export interface ConstructorConsulta {
  select: () => ConstructorConsulta;
  insert: (payload: unknown) => ConstructorConsulta;
  update: (payload: unknown) => ConstructorConsulta;
  upsert: (payload: unknown) => ConstructorConsulta;
  delete: () => ConstructorConsulta;
  single: () => Promise<RespuestaPreparada>;
  maybeSingle: () => Promise<RespuestaPreparada>;
  then: (
    resolver: (v: RespuestaPreparada) => unknown,
    rechazar?: (e: unknown) => unknown,
  ) => Promise<unknown>;
  catch: (rechazar: (e: unknown) => unknown) => Promise<unknown>;
  [metodo: string]: unknown;
}

export interface RespuestaPreparada {
  data?: unknown;
  error?: unknown;
}

/** Cola de respuestas por tabla; si falta, se devuelve `{ data: [], error: null }`. */
export type Guion = Record<string, RespuestaPreparada[]>;

const METODOS_FILTRO = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'or', 'not', 'contains',
] as const;

const METODOS_PASANTES = ['order', 'limit', 'range', 'returns', 'abortSignal'] as const;

export class DobleSupabase {
  readonly llamadas: LlamadaRegistrada[] = [];
  private readonly guion: Guion;

  constructor(guion: Guion = {}) {
    this.guion = guion;
  }

  /** Todas las llamadas a una tabla, en orden. */
  deTabla(tabla: string): LlamadaRegistrada[] {
    return this.llamadas.filter((l) => l.tabla === tabla);
  }

  /** La última escritura (insert o update) sobre una tabla. */
  ultimaEscritura(tabla: string): LlamadaRegistrada | undefined {
    return [...this.llamadas]
      .reverse()
      .find((l) => l.tabla === tabla && (l.operacion === 'insert' || l.operacion === 'update'));
  }

  /** El valor del primer filtro que use `metodo` sobre `columna`. */
  filtro(tabla: string, metodo: string, columna: string): unknown {
    for (const llamada of this.deTabla(tabla)) {
      const encontrado = llamada.filtros.find((f) => f.metodo === metodo && f.columna === columna);
      if (encontrado) return encontrado.valor;
    }
    return undefined;
  }

  reiniciar(): void {
    this.llamadas.length = 0;
  }

  private siguienteRespuesta(tabla: string): RespuestaPreparada {
    const cola = this.guion[tabla];
    if (!cola || cola.length === 0) return { data: [], error: null };
    return cola.length === 1 ? cola[0] : (cola.shift() as RespuestaPreparada);
  }

  from(tabla: string): ConstructorConsulta {
    const registro: LlamadaRegistrada = {
      tabla,
      operacion: 'select',
      payload: undefined,
      filtros: [],
    };
    this.llamadas.push(registro);

    const respuesta = (): RespuestaPreparada => {
      const r = this.siguienteRespuesta(tabla);
      return { data: r.data ?? null, error: r.error ?? null };
    };

    const constructor: ConstructorConsulta = {
      // Los argumentos de `select` (columnas, `{ count }`) no cambian nada aqui.
      select: () => constructor,
      insert: (payload: unknown) => {
        registro.operacion = 'insert';
        registro.payload = payload;
        return constructor;
      },
      update: (payload: unknown) => {
        registro.operacion = 'update';
        registro.payload = payload;
        return constructor;
      },
      upsert: (payload: unknown) => {
        registro.operacion = 'insert';
        registro.payload = payload;
        return constructor;
      },
      delete: () => {
        registro.operacion = 'delete';
        return constructor;
      },
      single: () => {
        const r = respuesta();
        const dato = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return Promise.resolve({ data: dato, error: r.error });
      },
      maybeSingle: () => constructor.single(),
      then: (resolver: (v: RespuestaPreparada) => unknown, rechazar?: (e: unknown) => unknown) =>
        Promise.resolve(respuesta()).then(resolver, rechazar),
      catch: (rechazar: (e: unknown) => unknown) =>
        Promise.resolve(respuesta()).catch(rechazar),
    };

    for (const metodo of METODOS_FILTRO) {
      constructor[metodo] = (columna: string, valor?: unknown) => {
        registro.filtros.push({ metodo, columna, valor });
        return constructor;
      };
    }
    for (const metodo of METODOS_PASANTES) {
      constructor[metodo] = () => constructor;
    }

    return constructor;
  }

  auth = {
    getUser: async () => ({ data: { user: { id: 'usuario-de-prueba' } }, error: null }),
  };
}
