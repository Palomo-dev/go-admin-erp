/**
 * Cuadre del domiciliario: tipos y cuentas para la pantalla (logística Fase 1). Puro.
 *
 * La base manda (`logistica_cuadre_*`, migración 20261123150416): recalcula totales, exige motivo
 * en la línea con faltante y motivo + responsable al cerrar con diferencia. Estas funciones solo
 * anticipan en pantalla lo que la base va a pedir, con la misma aritmética en centavos.
 */

export const RESPONSABLES_DIFERENCIA = ['courier', 'cashier', 'customer', 'other'] as const;
export type ResponsableDiferencia = (typeof RESPONSABLES_DIFERENCIA)[number];

export type EstadoLineaCuadre = 'pending' | 'received' | 'shortage' | 'cancelled';

export interface LineaCuadre {
  id: string;
  shipment_id: string;
  source_type: string | null;
  source_id: string | null;
  esperado: number;
  reportado: number | null;
  metodo_reportado: string | null;
  recibido: number | null;
  metodo_recibido: string | null;
  payment_id: string | null;
  status: EstadoLineaCuadre;
  diferencia: number;
  motivo: string | null;
}

export interface Cuadre {
  settlement_id: string;
  status: 'open' | 'closed' | 'cancelled';
  branch_id: number;
  driver_id: string;
  cash_session_id: number | null;
  esperado: number;
  recibido: number;
  diferencia: number;
  esperado_por_metodo: Record<string, number>;
  recibido_por_metodo: Record<string, number>;
  accounting_status: 'not_required' | 'pending_accountant' | 'resolved';
  lineas: LineaCuadre[];
}

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);
const pesos = (c: number) => c / 100;

/** recibido − esperado de una línea (negativo = faltante). */
export function diferenciaLinea(esperado: number, recibido: number): number {
  return pesos(centavos(recibido) - centavos(esperado));
}

/** ¿La base exigirá motivo al recibir esta línea? (recibe menos de lo esperado). */
export function lineaRequiereMotivo(esperado: number, recibido: number): boolean {
  return centavos(recibido) < centavos(esperado);
}

/** ¿El monto es aceptable para la línea? (entre 0 y lo esperado, como la base). */
export function montoLineaValido(esperado: number, recibido: number): boolean {
  return Number.isFinite(recibido) && recibido >= 0 && centavos(recibido) <= centavos(esperado);
}

/** Totales del cuadre a partir de sus líneas (las anuladas no cuentan). */
export function totalesCuadre(lineas: readonly Pick<LineaCuadre, 'esperado' | 'recibido' | 'status'>[]) {
  let esperado = 0;
  let recibido = 0;
  let diferencia = 0;
  let pendientes = 0;
  for (const l of lineas) {
    if (l.status === 'cancelled') continue;
    esperado += centavos(l.esperado);
    recibido += centavos(l.recibido ?? 0);
    if (l.status === 'pending') pendientes += 1;
    else diferencia += centavos(l.recibido ?? 0) - centavos(l.esperado);
  }
  return { esperado: pesos(esperado), recibido: pesos(recibido), diferencia: pesos(diferencia), pendientes };
}

/** ¿Se puede cerrar ya? Sin pendientes; con diferencia, exige motivo y responsable. */
export function puedeCerrarCuadre(
  lineas: readonly Pick<LineaCuadre, 'esperado' | 'recibido' | 'status'>[],
  motivo: string | null | undefined,
  responsable: string | null | undefined,
): { ok: true } | { ok: false; error: 'LINEAS_PENDIENTES' | 'MOTIVO_Y_RESPONSABLE_REQUERIDOS' } {
  const t = totalesCuadre(lineas);
  if (t.pendientes > 0) return { ok: false, error: 'LINEAS_PENDIENTES' };
  if (t.diferencia !== 0) {
    const conMotivo = !!(motivo ?? '').trim();
    const conResponsable = (RESPONSABLES_DIFERENCIA as readonly string[]).includes(responsable ?? '');
    if (!conMotivo || !conResponsable) return { ok: false, error: 'MOTIVO_Y_RESPONSABLE_REQUERIDOS' };
  }
  return { ok: true };
}
