// ============================================================================
// Doble de Supabase para las pruebas de compras y cuentas por pagar.
//
// Extiende `DobleSupabase` (zona horaria) con `rpc`: registra el nombre y los
// argumentos, y devuelve la respuesta preparada por nombre de función. Las
// pruebas de caracterización (plan FACTURAS-COMPRA-CXP §2) verifican QUÉ se
// escribe y QUÉ se llama, no solo que «algo» pase.
// ============================================================================

import { DobleSupabase, type Guion, type RespuestaPreparada } from '../../timezone/dobleSupabase';

export interface LlamadaRpc {
  fn: string;
  args: Record<string, unknown> | undefined;
}

export class DobleCompras extends DobleSupabase {
  readonly rpcs: LlamadaRpc[] = [];
  private readonly guionRpc: Record<string, RespuestaPreparada[]>;

  constructor(guion: Guion = {}, guionRpc: Record<string, RespuestaPreparada[]> = {}) {
    super(guion);
    this.guionRpc = guionRpc;
  }

  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
    this.rpcs.push({ fn, args });
    const cola = this.guionRpc[fn];
    const r = !cola || cola.length === 0 ? { data: null, error: null } : cola.length === 1 ? cola[0] : (cola.shift() as RespuestaPreparada);
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  }

  /** Escrituras (insert/update/delete) sobre una tabla. */
  escrituras(tabla: string, operacion?: 'insert' | 'update' | 'delete') {
    return this.deTabla(tabla).filter((l) =>
      operacion ? l.operacion === operacion : l.operacion === 'insert' || l.operacion === 'update' || l.operacion === 'delete',
    );
  }
}
