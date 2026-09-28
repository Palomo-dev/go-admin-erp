/**
 * Vocabulario de Tesorería: movimientos bancarios y de caja, en UN solo lugar.
 *
 * Valores verificados por MCP (2026-09-28) contra los CHECK de la base:
 *   bank_transactions.transaction_type ∈ deposit | withdrawal | transfer | fee | interest | other
 *   bank_transactions.status           ∈ unmatched | matched | reconciled
 *   cash_movements.type                ∈ in | out
 *
 * Antes cada pantalla inventaba los suyos: el movimiento manual del banco
 * escribía 'credit'/'debit' y 'pending' (el CHECK los rechaza: nunca se
 * guardó ninguno), el filtro «Pendientes» buscaba 'pending' y el pintado
 * preguntaba por 'credit' (todo salía en rojo). Y duplicar un ingreso de caja
 * pasaba 'in' donde se esperaba 'income' y creaba un EGRESO.
 *
 * Regla del signo (la misma que usa fn_auto_journal_bank y el disparador del
 * saldo): `amount` > 0 entra a la cuenta, `amount` < 0 sale.
 *
 * Módulo hoja: sin Supabase ni React.
 */

export const TIPOS_MOVIMIENTO_BANCARIO = ['deposit', 'withdrawal', 'transfer', 'fee', 'interest', 'other'] as const;
export type TipoMovimientoBancario = (typeof TIPOS_MOVIMIENTO_BANCARIO)[number];

export const ESTADOS_MOVIMIENTO_BANCARIO = ['unmatched', 'matched', 'reconciled'] as const;
export type EstadoMovimientoBancario = (typeof ESTADOS_MOVIMIENTO_BANCARIO)[number];

/** Lo que el formulario de ingresos/egresos llama tipo. */
export type TipoMovimiento = 'income' | 'expense';
/** Lo que guarda `cash_movements.type`. */
export type TipoCaja = 'in' | 'out';

const CAJA: Record<TipoMovimiento, TipoCaja> = { income: 'in', expense: 'out' };
const BANCO: Record<TipoMovimiento, 'deposit' | 'withdrawal'> = { income: 'deposit', expense: 'withdrawal' };

/** income → 'in', expense → 'out'. */
export function tipoCaja(tipo: TipoMovimiento): TipoCaja {
  return CAJA[tipo];
}

/**
 * Inverso de `tipoCaja`: lo que viene de la base ('in'/'out') al tipo del
 * formulario. Acepta también el tipo del formulario (ya convertido) para que
 * un llamador que lo pase dos veces no invierta el sentido.
 */
export function tipoDesdeCaja(valor: string | null | undefined): TipoMovimiento {
  if (valor === 'in' || valor === 'income') return 'income';
  if (valor === 'out' || valor === 'expense') return 'expense';
  throw new Error(`tipo_de_caja_desconocido:${String(valor)}`);
}

/** income → 'deposit', expense → 'withdrawal' (los que listan Ingresos y Egresos). */
export function tipoBanco(tipo: TipoMovimiento): 'deposit' | 'withdrawal' {
  return BANCO[tipo];
}

/** Sentido de un movimiento bancario por el signo de su importe. */
export function tipoDesdeImporteBancario(amount: number | string | null | undefined): TipoMovimiento {
  return Number(amount ?? 0) >= 0 ? 'income' : 'expense';
}

/** `true` si el movimiento entra a la cuenta (se pinta en verde con «+»). */
export function esEntradaBancaria(tx: { amount: number | string | null | undefined }): boolean {
  return Number(tx.amount ?? 0) > 0;
}

/** Fila lista para `bank_transactions` desde el sentido del formulario y un monto positivo. */
export function movimientoBancario(tipo: TipoMovimiento, monto: number): { transaction_type: 'deposit' | 'withdrawal'; amount: number } {
  const abs = Math.abs(monto);
  return { transaction_type: tipoBanco(tipo), amount: tipo === 'income' ? abs : -abs };
}

export function estaConciliado(status: string | null | undefined): boolean {
  return status === 'matched' || status === 'reconciled';
}

/**
 * Códigos estables que devuelven las RPC y disparadores de Tesorería
 * (migraciones 20260928160000 y 20260928161000) y los que añade el cliente.
 * Cada uno tiene su texto en `tesoreria.errores.<código>` en los 4 idiomas.
 */
export const CODIGOS_ERROR_TESORERIA = [
  // El más largo primero: `codigoErrorTesoreria` busca por inclusión.
  'saldo_insuficiente_para_revertir',
  'saldo_insuficiente',
  'moneda_distinta',
  'cuenta_no_encontrada',
  'cuenta_inactiva',
  'cuenta_requerida',
  'cuentas_iguales',
  'monto_invalido',
  'fecha_futura',
  'sucursal_invalida',
  'sucursal_requerida',
  'transferencia_no_encontrada',
  'movimiento_no_encontrado',
  'movimiento_conciliado',
  'movimiento_importado',
  'anulacion_de_anulacion',
  'sin_caja_abierta_sucursal',
  'caja_cerrada',
  'saldo_bancario_por_movimientos',
  'sin_permiso',
  'sin_acceso_sucursal',
  'no_autenticado',
  'sin_organizacion',
  'desconocido',
] as const;
export type CodigoErrorTesoreria = (typeof CODIGOS_ERROR_TESORERIA)[number];

/** Error de PostgREST/RPC → código estable. Nunca deja pasar el texto crudo de Postgres. */
export function codigoErrorTesoreria(error: unknown): CodigoErrorTesoreria {
  const e = (error ?? {}) as { code?: string; message?: string };
  const mensaje = e.message ?? '';
  const directo = CODIGOS_ERROR_TESORERIA.find((c) => c !== 'desconocido' && mensaje.includes(c));
  if (directo) return directo;
  if (mensaje.includes('SUCURSAL_NO_PERMITIDA')) return 'sin_acceso_sucursal';
  if (mensaje.includes('Acceso denegado') || e.code === '42501') return 'sin_permiso';
  return 'desconocido';
}

/**
 * uuid determinista (formato v5, SHA-256 truncado) a partir de una semilla.
 * Sirve de clave de idempotencia: anular dos veces el mismo movimiento de caja
 * manda el mismo uuid y `pos_caja_registrar_movimiento` responde el que ya existe.
 */
export async function uuidDeterminista(semilla: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(semilla)));
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
