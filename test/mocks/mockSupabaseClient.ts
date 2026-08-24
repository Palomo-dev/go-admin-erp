/**
 * Mock del cliente Supabase para tests.
 * Implementa la API fluida (from/select/insert/update/delete/eq/in/order/limit/
 * single/maybeSingle) usada por los servicios de integracion QR.
 * Permite configurar datos por tabla, resultados de insert/update y registrar
 * todas las operaciones para aserciones.
 */

/** Filtro de igualdad aplicado a una consulta. */
interface EqFilter {
  column: string;
  value: unknown;
}

/** Filtro IN aplicado a una consulta. */
interface InFilter {
  column: string;
  values: unknown[];
}

/** Registro de una operacion ejecutada contra el mock. */
export interface MockOperation {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  payload: Record<string, unknown> | Record<string, unknown>[] | null;
  filters: EqFilter[];
  inFilters: InFilter[];
  terminal: 'single' | 'maybeSingle' | 'default';
}

/** Error simulado de Supabase (PostgREST). */
export interface MockSupabaseError {
  message: string;
  code?: string;
}

/** Resultado thenable de una consulta Supabase. */
interface SupabaseResult<T> {
  data: T | null;
  error: MockSupabaseError | null;
}

type Row = Record<string, unknown>;

/**
 * Builder fluido de consultas mock. Es thenable (await directo) y ademas
 * expone single()/maybeSingle() que retornan una Promise.
 */
class MockQueryBuilder {
  private table: string;
  private client: MockSupabaseClient;
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private filters: EqFilter[] = [];
  private inFilters: InFilter[] = [];
  private returningSelect = false;
  private limitN: number | null = null;

  constructor(table: string, client: MockSupabaseClient) {
    this.table = table;
    this.client = client;
  }

  select(_cols?: string): this {
    // Si viene despues de insert/update/delete, indica que se quiere el row resultante
    if (
      this.operation === 'insert' ||
      this.operation === 'update' ||
      this.operation === 'delete'
    ) {
      this.returningSelect = true;
    } else {
      this.operation = 'select';
    }
    return this;
  }

  insert(row: Row | Row[]): this {
    this.operation = 'insert';
    this.payload = row;
    return this;
  }

  update(row: Row): this {
    this.operation = 'update';
    this.payload = row;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    this.payload = null;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values });
    return this;
  }

  order(_column: string, _opts?: { ascending?: boolean }): this {
    // No afecta el resultado del mock
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  /** Aplica los filtros eq/in a un conjunto de filas. */
  private applyFilters(rows: Row[]): Row[] {
    let result = rows;
    for (const f of this.filters) {
      result = result.filter((r) => r[f.column] === f.value);
    }
    for (const f of this.inFilters) {
      result = result.filter((r) => f.values.includes(r[f.column]));
    }
    if (this.limitN !== null) {
      result = result.slice(0, this.limitN);
    }
    return result;
  }

  /** Resuelve el resultado segun la operacion y el terminal. */
  private resolve(terminal: 'single' | 'maybeSingle' | 'default'): SupabaseResult<unknown> {
    // Registrar la operacion
    this.client.calls.push({
      table: this.table,
      operation: this.operation,
      payload: this.payload,
      filters: [...this.filters],
      inFilters: [...this.inFilters],
      terminal,
    });

    if (this.operation === 'select') {
      const allRows = this.client.tableData[this.table] ?? [];
      const matched = this.applyFilters(allRows);

      if (terminal === 'single') {
        if (matched.length === 0) {
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
        }
        if (matched.length > 1) {
          return { data: null, error: { message: 'multiple rows returned' } };
        }
        return { data: matched[0], error: null };
      }

      if (terminal === 'maybeSingle') {
        if (matched.length === 0) {
          return { data: null, error: null };
        }
        if (matched.length > 1) {
          return { data: null, error: { message: 'multiple rows returned' } };
        }
        return { data: matched[0], error: null };
      }

      // default: retorna array
      return { data: matched, error: null };
    }

    if (this.operation === 'insert') {
      const err = this.client.insertError[this.table];
      if (err) {
        return { data: null, error: err };
      }
      if (this.returningSelect) {
        const resultRow = this.client.insertResult[this.table] ?? this.payload;
        return { data: resultRow, error: null };
      }
      return { data: null, error: null };
    }

    if (this.operation === 'update') {
      const err = this.client.updateError[this.table];
      if (err) {
        return { data: null, error: err };
      }
      if (this.returningSelect) {
        return { data: this.client.updateResult[this.table] ?? null, error: null };
      }
      return { data: null, error: null };
    }

    // delete
    const err = this.client.deleteError[this.table];
    if (err) {
      return { data: null, error: err };
    }
    return { data: this.client.deleteResult[this.table] ?? null, error: null };
  }

  single(): Promise<SupabaseResult<unknown>> {
    return Promise.resolve(this.resolve('single'));
  }

  maybeSingle(): Promise<SupabaseResult<unknown>> {
    return Promise.resolve(this.resolve('maybeSingle'));
  }

  // Thenable: permite `await supabase.from(t).insert(row).eq(...)`
  then<TResult1 = SupabaseResult<unknown>, TResult2 = never>(
    onFulfilled?:
      | ((value: SupabaseResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onRejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve<SupabaseResult<unknown>>(this.resolve('default')).then(
      onFulfilled,
      onRejected,
    );
  }
}

/**
 * Cliente mock de Supabase. Singleton configurable desde los tests.
 */
export class MockSupabaseClient {
  /** Datos por tabla para consultas select. */
  tableData: Record<string, Row[]> = {};

  /** Resultado a retornar tras un insert con .select().single(). */
  insertResult: Record<string, Row | Row[]> = {};

  /** Error a retornar tras un insert. */
  insertError: Record<string, MockSupabaseError> = {};

  /** Resultado a retornar tras un update con .select(). */
  updateResult: Record<string, Row | null> = {};

  /** Error a retornar tras un update. */
  updateError: Record<string, MockSupabaseError> = {};

  /** Resultado a retornar tras un delete con .select(). */
  deleteResult: Record<string, Row | null> = {};

  /** Error a retornar tras un delete. */
  deleteError: Record<string, MockSupabaseError> = {};

  /** Registro de todas las operaciones ejecutadas (para aserciones). */
  calls: MockOperation[] = [];

  from(table: string): MockQueryBuilder {
    return new MockQueryBuilder(table, this);
  }

  /** Reinicia el estado del mock entre tests. */
  reset(): void {
    this.tableData = {};
    this.insertResult = {};
    this.insertError = {};
    this.updateResult = {};
    this.updateError = {};
    this.deleteResult = {};
    this.deleteError = {};
    this.calls = [];
  }

  /** Configura las filas de una tabla. */
  setTableData(table: string, rows: Row[]): void {
    this.tableData[table] = rows;
  }

  /** Configura el resultado de un insert con select. */
  setInsertResult(table: string, row: Row | Row[]): void {
    this.insertResult[table] = row;
  }

  /** Configura un error de insert. */
  setInsertError(table: string, message: string): void {
    this.insertError[table] = { message };
  }

  /** Configura un error de update. */
  setUpdateError(table: string, message: string): void {
    this.updateError[table] = { message };
  }

  /** Filtra las operaciones registradas por tabla y tipo. */
  getCalls(table: string, operation?: MockOperation['operation']): MockOperation[] {
    return this.calls.filter(
      (c) => c.table === table && (operation === undefined || c.operation === operation),
    );
  }
}

/** Instancia singleton compartida por los mocks de admin y config. */
export const mockSupabase = new MockSupabaseClient();
