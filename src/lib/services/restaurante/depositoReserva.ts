/**
 * Depósito de las reservas de mesa (paquete D · D7). Lógica PURA: la usan la
 * configuración (POS › Reservas › Configuración) y la lista de reservas.
 *
 * Quién decide qué:
 * - La base calcula y cobra (`fn_reserva_mesa_crear_web`,
 *   `fn_reserva_mesa_deposito_resultado`): el monto que paga el cliente nunca
 *   sale de aquí ni del navegador.
 * - Aquí solo se describe lo guardado para mostrarlo y se valida el formulario.
 *
 * Estados de `restaurant_reservations.deposit_status` (migración
 * `20261006170000_reservas_deposito_web`): pending (por pagar), paid, failed
 * (rechazado), expired (vencido), refunded y paid_late (pagado con la reserva
 * ya liberada: hay que reembolsar o reactivar a mano). NULL = sin depósito.
 */

export type EstadoDeposito = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'paid_late';

export const ESTADOS_DEPOSITO: readonly EstadoDeposito[] = ['pending', 'paid', 'failed', 'expired', 'refunded', 'paid_late'];

/** Dónde se conecta una pasarela (Wompi) para poder cobrar depósitos. */
export const RUTA_INTEGRACIONES = '/app/integraciones/conexiones';

/** Textos de la interfaz del depósito (español de Colombia). */
export const TEXTOS_DEPOSITO = {
  pedir: 'Pedir depósito',
  pedirAyuda: 'El sitio cobra el depósito al reservar con la pasarela de la organización. La reserva queda «pendiente de pago» hasta que la pasarela confirma; si el pago falla o no se completa en 30 minutos, la mesa se libera.',
  sinPasarela: 'Conecta una pasarela en Integraciones para cobrar depósitos.',
  irAIntegraciones: 'Ir a Integraciones',
  conPasarela: (pasarela: string) => `Se cobra con ${nombrePasarela(pasarela)}.`,
  modo: 'Cómo se calcula',
  modoFijo: 'Monto fijo por reserva',
  modoPorPersona: 'Monto por persona',
  monto: 'Monto',
  montoPorPersona: 'Monto por persona',
  reembolsable: 'Reembolsable',
  reembolsableAyuda: 'Si el cliente cancela a tiempo, el equipo devuelve el depósito.',
  horasReembolso: 'Reembolsable hasta (horas antes)',
  horasReembolsoAyuda: (horasCancelacion: number) =>
    `Vacío = las mismas ${horasCancelacion} h del plazo para cancelar.`,
  errorSinPasarela: 'Conecta una pasarela antes de pedir depósito.',
  errorMonto: 'Escribe el monto del depósito.',
} as const;

const NOMBRES_PASARELA: Record<string, string> = { wompi_co: 'Wompi' };

export function nombrePasarela(codigo: string | null | undefined): string {
  if (!codigo) return 'la pasarela';
  return NOMBRES_PASARELA[codigo] ?? codigo;
}

/** Monto que se cobraría por una reserva de `personas` (el mismo cálculo que la base). */
export function montoDeposito(
  ajustes: { deposit_amount: number | null; deposit_per_person: boolean },
  personas: number,
): number | null {
  const base = Number(ajustes.deposit_amount);
  if (!Number.isFinite(base) || base <= 0) return null;
  const n = Math.max(1, Math.floor(Number(personas) || 1));
  return Math.round(base * (ajustes.deposit_per_person ? n : 1) * 100) / 100;
}

/** Datos de depósito de una fila de `restaurant_reservations` (columnas de D7, opcionales antes de aplicarla). */
export interface DepositoDeReserva {
  deposit_status?: string | null;
  deposit_amount?: number | string | null;
  deposit_currency?: string | null;
  deposit_due_at?: string | null;
  deposit_paid_at?: string | null;
  deposit_refundable_until?: string | null;
  deposit_refunded_at?: string | null;
  deposit_payment_id?: string | null;
}

export type TonoDeposito = 'exito' | 'aviso' | 'peligro' | 'neutro';

export interface ResumenDeposito {
  estado: EstadoDeposito;
  etiqueta: string;
  tono: TonoDeposito;
  monto: number | null;
  /** Moneda guardada en la reserva; `null` → la de la organización. */
  moneda: string | null;
  /** El equipo puede registrar el reembolso en finanzas. */
  puedeReembolsar: boolean;
  /** Aún dentro del plazo de reembolso (si es reembolsable). */
  dentroDelPlazo: boolean | null;
}

function esEstado(v: unknown): v is EstadoDeposito {
  return typeof v === 'string' && (ESTADOS_DEPOSITO as readonly string[]).includes(v);
}

/** Resumen para la tarjeta de la reserva, o `null` si la reserva no lleva depósito. */
export function resumenDeposito(r: DepositoDeReserva, ahora: Date = new Date()): ResumenDeposito | null {
  if (!esEstado(r.deposit_status)) return null;
  const estado = r.deposit_status;
  const montoN = r.deposit_amount == null ? NaN : Number(r.deposit_amount);
  const monto = Number.isFinite(montoN) ? montoN : null;
  const hasta = r.deposit_refundable_until ? Date.parse(r.deposit_refundable_until) : NaN;
  const dentroDelPlazo = Number.isFinite(hasta) ? ahora.getTime() <= hasta : null;
  const etiquetas: Record<EstadoDeposito, [string, TonoDeposito]> = {
    pending: ['Depósito por pagar', 'aviso'],
    paid: ['Depósito pagado', 'exito'],
    failed: ['Pago del depósito rechazado', 'peligro'],
    expired: ['Depósito vencido sin pagar', 'neutro'],
    refunded: ['Depósito reembolsado', 'neutro'],
    paid_late: ['Depósito pagado tarde: reembolsar o reactivar', 'peligro'],
  };
  const [etiqueta, tono] = etiquetas[estado];
  return {
    estado,
    etiqueta,
    tono,
    monto,
    moneda: r.deposit_currency ? r.deposit_currency.toUpperCase() : null,
    puedeReembolsar: estado === 'paid' || estado === 'paid_late',
    dentroDelPlazo,
  };
}

/**
 * Estado del interruptor «Pedir depósito» en la configuración: habilitado solo
 * con pasarela. Si ya está encendido y la pasarela se desconectó, se deja
 * apagarlo (si no, la sede quedaría sin poder guardar nada).
 */
export function interruptorDeposito(
  pasarela: string | null | undefined,
  pedido: boolean,
  soloLectura: boolean,
): { deshabilitado: boolean; avisoSinPasarela: boolean } {
  const sinPasarela = !pasarela;
  return {
    deshabilitado: soloLectura || (sinPasarela && !pedido),
    avisoSinPasarela: sinPasarela,
  };
}
