/**
 * Alertas de cuentas de dinero (Finanzas, ronda 2 · A1/A2). Sin React ni
 * Supabase: lo usan el servicio (claves, validación), la ruta y la pantalla
 * (filas de la tabla y cifras de arriba).
 *
 * Las alertas se calculan al vuelo en `anomalyDetectionService`; lo que se
 * guarda es su REVISIÓN (`bank_alert_reviews`). Para casar una alerta con su
 * revisión, cada alerta lleva una clave estable armada con sus datos: si la
 * alerta cambia (un tercer duplicado, otra diferencia de saldo) cambia la
 * clave y vuelve a quedar abierta.
 */

import { validarMotivo, MOTIVO_MAXIMO, MOTIVO_MINIMO } from '@/components/kit/motivo';

export type TipoAlerta =
  | 'duplicate'
  | 'unusual_amount'
  | 'unusual_time'
  | 'fragmentation'
  | 'weekend_high_amount'
  | 'balance_discrepancy';

export const TIPOS_ALERTA: readonly TipoAlerta[] = [
  'duplicate',
  'unusual_amount',
  'unusual_time',
  'fragmentation',
  'weekend_high_amount',
  'balance_discrepancy',
];

export type SeveridadAlerta = 'high' | 'medium' | 'low';

/** `revisada`: no era un error. `duplicado_anulado`: se anuló uno de los movimientos. */
export type ResultadoRevision = 'revisada' | 'duplicado_anulado';
export const RESULTADOS_REVISION: readonly ResultadoRevision[] = ['revisada', 'duplicado_anulado'];

export const TABLA_REVISIONES = 'bank_alert_reviews';

// ---------------------------------------------------------------------------
// Claves estables
// ---------------------------------------------------------------------------

/** Duplicado entre movimientos del banco: los ids ordenados. */
export function claveDuplicado(ids: readonly number[]): string {
  return `dup:${[...ids].sort((a, b) => a - b).join(',')}`;
}

/** Duplicado que trajo el banco (mismo id externo varias veces). */
export function claveDuplicadoExterno(idExterno: string): string {
  return `dup-of:${idExterno}`;
}

/** Alerta sobre un movimiento (monto inusual, horario, fin de semana, fragmentación). */
export function claveMovimiento(tipo: Exclude<TipoAlerta, 'duplicate' | 'balance_discrepancy'>, idMovimiento: number): string {
  return `${tipo}:${idMovimiento}`;
}

/** Diferencia de saldo: la cuenta y la diferencia (si cambia, es otra alerta). */
export function claveDiferenciaSaldo(idCuenta: number, diferencia: number): string {
  return `disc:${idCuenta}:${diferencia.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Formas que llegan del servicio
// ---------------------------------------------------------------------------

export interface MovimientoAlerta {
  id: number;
  /** Instante (timestamptz) del movimiento. */
  fecha: string | null;
  descripcion: string | null;
  referencia: string | null;
  monto: number;
}

export interface AlertaDuplicado {
  id: string;
  transactionIds: number[];
  amount: number;
  /** Día del negocio `YYYY-MM-DD`. */
  date: string;
  description: string;
  count: number;
  severity: 'high' | 'medium';
  bankAccountId?: number | null;
  bankAccountName?: string | null;
  movimientos?: MovimientoAlerta[];
}

export interface AlertaMovimiento {
  id: string;
  type: 'unusual_amount' | 'unusual_time' | 'fragmentation' | 'weekend_high_amount';
  severity: SeveridadAlerta;
  transactionId?: number;
  amount?: number;
  /** Instante (timestamptz). */
  date?: string;
  description: string;
  expectedValue?: number;
  actualValue?: number;
  bankAccountId?: number | null;
  bankAccountName?: string | null;
}

export interface AlertaDiferenciaSaldo {
  id: string;
  bankAccountId: number;
  bankAccountName: string;
  localBalance: number;
  calculatedBalance: number;
  realBalance: number | null;
  difference: number;
  severity: 'high' | 'medium';
}

export interface ResumenDeteccion {
  duplicates: AlertaDuplicado[];
  unusualAmounts: AlertaMovimiento[];
  suspiciousPatterns: AlertaMovimiento[];
  balanceDiscrepancies: AlertaDiferenciaSaldo[];
}

export interface RevisionAlerta {
  clave: string;
  tipo: TipoAlerta;
  resultado: ResultadoRevision;
  motivo: string;
  revisadoPor: string | null;
  revisadoPorNombre: string | null;
  /** Instante (timestamptz). */
  revisadoEn: string;
  movimientoAnuladoId: number | null;
}

// ---------------------------------------------------------------------------
// Filas de la tabla
// ---------------------------------------------------------------------------

export interface FilaAlerta {
  clave: string;
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  cuentaId: number | null;
  cuentaNombre: string | null;
  /** Monto que se muestra (en una diferencia de saldo, la diferencia). */
  monto: number | null;
  /** `dia` (YYYY-MM-DD) en duplicados; `instante` en el resto. */
  fecha: { tipo: 'dia' | 'instante'; valor: string } | null;
  /** Datos para armar el detalle en el idioma de la pantalla. */
  datos: {
    conteo?: number;
    veces?: number;
    esperado?: number;
    actual?: number;
    descripcion?: string;
    saldoLocal?: number;
    saldoCalculado?: number;
    saldoReal?: number | null;
  };
  movimientos: MovimientoAlerta[];
  transaccionIds: number[];
  revision: RevisionAlerta | null;
}

const PESO_SEVERIDAD: Record<SeveridadAlerta, number> = { high: 0, medium: 1, low: 2 };

/** Cuántas veces el promedio (1 decimal); null si no hay promedio. */
export function vecesPromedio(actual: number | undefined, esperado: number | undefined): number | null {
  if (actual === undefined || esperado === undefined) return null;
  const base = Math.abs(esperado);
  if (base === 0) return null;
  return Math.round((Math.abs(actual) / base) * 10) / 10;
}

/**
 * Las cuatro familias del servicio en una sola lista: abiertas primero, luego
 * por severidad y por monto. Cada fila trae su revisión, si la tiene.
 */
export function aplanarAlertas(resumen: ResumenDeteccion | null | undefined, revisiones: readonly RevisionAlerta[] = []): FilaAlerta[] {
  if (!resumen) return [];
  const porClave = new Map(revisiones.map((r) => [r.clave, r]));
  const filas: FilaAlerta[] = [];

  for (const d of resumen.duplicates ?? []) {
    filas.push({
      clave: d.id,
      tipo: 'duplicate',
      severidad: d.severity,
      cuentaId: d.bankAccountId ?? null,
      cuentaNombre: d.bankAccountName ?? null,
      monto: d.amount,
      fecha: d.date ? { tipo: 'dia', valor: d.date } : null,
      datos: { conteo: d.count, descripcion: d.description || undefined },
      movimientos: d.movimientos ?? [],
      transaccionIds: d.transactionIds ?? [],
      revision: porClave.get(d.id) ?? null,
    });
  }

  for (const a of [...(resumen.unusualAmounts ?? []), ...(resumen.suspiciousPatterns ?? [])]) {
    filas.push({
      clave: a.id,
      tipo: a.type,
      severidad: a.severity,
      cuentaId: a.bankAccountId ?? null,
      cuentaNombre: a.bankAccountName ?? null,
      monto: a.amount ?? a.actualValue ?? null,
      fecha: a.date ? { tipo: 'instante', valor: a.date } : null,
      datos: {
        veces: vecesPromedio(a.actualValue, a.expectedValue) ?? undefined,
        esperado: a.expectedValue,
        actual: a.actualValue,
      },
      movimientos: [],
      transaccionIds: a.transactionId ? [a.transactionId] : [],
      revision: porClave.get(a.id) ?? null,
    });
  }

  for (const s of resumen.balanceDiscrepancies ?? []) {
    filas.push({
      clave: s.id,
      tipo: 'balance_discrepancy',
      severidad: s.severity,
      cuentaId: s.bankAccountId,
      cuentaNombre: s.bankAccountName,
      monto: s.difference,
      fecha: null,
      datos: { saldoLocal: s.localBalance, saldoCalculado: s.calculatedBalance, saldoReal: s.realBalance },
      movimientos: [],
      transaccionIds: [],
      revision: porClave.get(s.id) ?? null,
    });
  }

  return filas.sort((a, b) => {
    const abiertaA = a.revision ? 1 : 0;
    const abiertaB = b.revision ? 1 : 0;
    if (abiertaA !== abiertaB) return abiertaA - abiertaB;
    const sev = PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad];
    if (sev !== 0) return sev;
    return Math.abs(b.monto ?? 0) - Math.abs(a.monto ?? 0);
  });
}

export interface CifrasAlertas {
  abiertas: number;
  severidadAlta: number;
  posiblesDuplicados: number;
  diferenciasSaldo: number;
}

/** Las cuatro cifras de arriba: solo cuentan las alertas abiertas. */
export function cifrasAlertas(filas: readonly FilaAlerta[]): CifrasAlertas {
  const abiertas = filas.filter((f) => !f.revision);
  return {
    abiertas: abiertas.length,
    severidadAlta: abiertas.filter((f) => f.severidad === 'high').length,
    posiblesDuplicados: abiertas.filter((f) => f.tipo === 'duplicate').length,
    diferenciasSaldo: abiertas.filter((f) => f.tipo === 'balance_discrepancy').length,
  };
}

/** «Es un duplicado: anular uno» solo tiene sentido con dos o más movimientos del banco. */
export function puedeAnularDuplicado(fila: Pick<FilaAlerta, 'tipo' | 'movimientos' | 'revision'>): boolean {
  return fila.tipo === 'duplicate' && !fila.revision && fila.movimientos.length >= 2;
}

/** Movimiento que se propone anular: el último registrado (el primero se conserva). */
export function movimientoSugeridoParaAnular(movimientos: readonly MovimientoAlerta[]): number | null {
  if (movimientos.length < 2) return null;
  return [...movimientos].sort((a, b) => b.id - a.id)[0].id;
}

// ---------------------------------------------------------------------------
// Validación de la revisión (servidor y pantalla)
// ---------------------------------------------------------------------------

export type ErrorRevision =
  | 'clave_invalida'
  | 'tipo_invalido'
  | 'resultado_invalido'
  | 'motivo_vacio'
  | 'motivo_corto'
  | 'motivo_largo'
  | 'movimiento_requerido';

export interface EntradaRevision {
  clave: string;
  tipo: TipoAlerta;
  motivo: string;
  resultado: ResultadoRevision;
  cuentaId: number | null;
  movimientoAnuladoId: number | null;
}

export type ResultadoValidacionRevision =
  | { valido: true; entrada: EntradaRevision }
  | { valido: false; error: ErrorRevision };

function entero(valor: unknown): number | null {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Valida lo que llega en el body. Acepta el nombre viejo de los campos
 * (`anomalyId`, `resolution`) para no romper a quien aún los mande.
 */
export function validarRevision(body: Record<string, unknown> | null | undefined): ResultadoValidacionRevision {
  const b = body ?? {};
  const clave = typeof b.clave === 'string' ? b.clave.trim() : typeof b.anomalyId === 'string' ? b.anomalyId.trim() : '';
  if (!clave || clave.length > 300) return { valido: false, error: 'clave_invalida' };

  const tipo = b.tipo as TipoAlerta;
  if (!TIPOS_ALERTA.includes(tipo)) return { valido: false, error: 'tipo_invalido' };

  const resultado = (b.resultado ?? 'revisada') as ResultadoRevision;
  if (!RESULTADOS_REVISION.includes(resultado)) return { valido: false, error: 'resultado_invalido' };

  const crudo = typeof b.motivo === 'string' ? b.motivo : typeof b.resolution === 'string' ? b.resolution : '';
  const motivo = validarMotivo(crudo, { minimo: MOTIVO_MINIMO, maximo: MOTIVO_MAXIMO });
  if (!motivo.valido) {
    return { valido: false, error: motivo.error === 'vacio' ? 'motivo_vacio' : motivo.error === 'corto' ? 'motivo_corto' : 'motivo_largo' };
  }

  const movimientoAnuladoId = entero(b.movimientoAnuladoId);
  if (resultado === 'duplicado_anulado' && (tipo !== 'duplicate' || movimientoAnuladoId === null)) {
    return { valido: false, error: 'movimiento_requerido' };
  }

  return {
    valido: true,
    entrada: {
      clave,
      tipo,
      motivo: motivo.limpio,
      resultado,
      cuentaId: entero(b.cuentaId),
      movimientoAnuladoId: resultado === 'duplicado_anulado' ? movimientoAnuladoId : null,
    },
  };
}

/** La tabla de revisiones aún no existe (migración sin aplicar). */
export function esTablaRevisionesInexistente(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes(TABLA_REVISIONES) && (msg.includes('does not exist') || msg.includes('could not find'));
}

/** Nombre visible de un perfil (nombre y apellido, o el correo). */
export function nombrePerfil(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!p) return null;
  const nombre = [p.first_name, p.last_name].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');
  return nombre || (p.email ?? '').trim() || null;
}

/** Cuenta en una línea: «Bancolombia ··4321». */
export function etiquetaCuenta(nombre: string | null | undefined, numero: string | null | undefined): string | null {
  const n = (nombre ?? '').trim();
  const digitos = (numero ?? '').replace(/\D/g, '');
  const cola = digitos.length >= 4 ? `··${digitos.slice(-4)}` : '';
  if (!n && !cola) return null;
  if (cola && n.includes(cola)) return n;
  return [n, cola].filter(Boolean).join(' ');
}
