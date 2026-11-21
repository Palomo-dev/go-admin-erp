/**
 * Procesadores de pago (datáfono y pasarelas) — lógica pura de la pantalla
 * (Figma «07 Finanzas», sección 2704:150133; decisiones del Contador y del dueño
 * del 2026-11-21).
 *
 * La contabilidad vive en la base de datos: `fn_procesadores_pago_saldos`,
 * `fn_procesador_abono_registrar`, `fn_procesador_pago_configurar`. Aquí solo se
 * calcula lo que la pantalla muestra antes de guardar (el cuadre del abono y si la
 * factura del procesador es obligatoria) y se traducen los errores de la base a
 * claves de texto. La base vuelve a validar todo al guardar.
 */

export const PROCESADORES = ['datafono', 'wompi', 'bold', 'mercadopago', 'payu', 'stripe', 'paypal'] as const;
export type CodigoProcesador = (typeof PROCESADORES)[number];
export type OrigenProcesador = 'nacional' | 'exterior';
export type MotivoAlerta = 'saldo_negativo' | 'sin_abono' | 'saldo_retenido_sin_retiro';
export type EstadoSaldo = 'al_dia' | 'alerta' | 'saldo_retenido';

export function esCodigoProcesador(valor: unknown): valor is CodigoProcesador {
  return typeof valor === 'string' && (PROCESADORES as readonly string[]).includes(valor);
}

/** Una fila de `fn_procesadores_pago_saldos`. */
export interface SaldoProcesador {
  procesador: CodigoProcesador;
  nombre: string;
  nit: string | null;
  cuenta: string;
  origen: OrigenProcesador;
  retiene_saldo: boolean;
  mes: string;
  cobrado_mes: number;
  abonado_mes: number;
  saldo: number;
  ultimo_cobro: string | null;
  ultimo_abono: string | null;
  cobro_pendiente_desde: string | null;
  dias_habiles_sin_abono: number | null;
  dias_sin_retiro: number | null;
  alerta: boolean;
  motivo_alerta: MotivoAlerta | null;
  estado: EstadoSaldo;
}

/** Datos de cada procesador como tercero: lo que ve «Datos de los procesadores». */
export interface DatosProcesador {
  codigo: CodigoProcesador;
  cuenta: string;
  /** Nombre del catálogo («Wompi»): el que se muestra en la tabla. */
  etiqueta: string;
  /** NIT vigente (el de la organización o el de fábrica). */
  nit: string | null;
  /** Nombre como tercero vigente. */
  nombre: string;
  /** NIT y nombre escritos por la organización (null = usa el de fábrica). */
  nitPropio: string | null;
  nombrePropio: string | null;
  nitDeFabrica: boolean;
  origen: OrigenProcesador;
  retieneSaldo: boolean;
}

export type TratamientoIva = 'descontable' | 'gasto' | 'proporcional' | 'exterior';

export interface AbonoProcesador {
  id: string;
  procesador: CodigoProcesador;
  fecha: string;
  bruto: number;
  comision: number;
  ivaComision: number;
  retenciones: number;
  neto: number;
  cuentaBancariaId: number | null;
  cuentaBanco: string;
  referencia: string | null;
  factura: string | null;
  tratamientoIva: TratamientoIva | null;
  estado: 'registrado' | 'anulado';
  asiento: number | null;
}

export interface CuentaBancaria {
  id: number;
  nombre: string;
  banco: string | null;
  /** Últimos 4 dígitos del número, o null. */
  final: string | null;
  cuenta: string | null;
}

export interface RespuestaProcesadores {
  mes: string;
  saldos: SaldoProcesador[];
  procesadores: DatosProcesador[];
  abonos: AbonoProcesador[];
  bancos: CuentaBancaria[];
  /** Responsable de IVA hoy según el perfil tributario; null si no está definido. */
  responsableIva: boolean | null;
}

// ── Saldos ────────────────────────────────────────────────────────────────────

/** Primero los que tienen alerta; después de mayor a menor saldo. */
export function ordenarSaldos(saldos: readonly SaldoProcesador[]): SaldoProcesador[] {
  return [...saldos].sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.saldo - a.saldo);
}

export function totalesSaldos(saldos: readonly SaldoProcesador[]) {
  return saldos.reduce(
    (t, s) => ({
      cobrado: t.cobrado + s.cobrado_mes,
      abonado: t.abonado + s.abonado_mes,
      saldo: t.saldo + s.saldo,
      alertas: t.alertas + (s.alerta ? 1 : 0),
    }),
    { cobrado: 0, abonado: 0, saldo: 0, alertas: 0 },
  );
}

/** Primer día del mes de una fecha `YYYY-MM-DD` (sin pasar por Date: no se corre de día). */
export function inicioDeMes(fecha: string): string {
  return /^\d{4}-\d{2}/.test(fecha) ? `${fecha.slice(0, 7)}-01` : fecha;
}

/** `YYYY-MM-01` del mes anterior o siguiente. */
export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + delta;
  const anio = Math.floor(total / 12);
  const mesN = (total % 12) + 1;
  return `${anio}-${String(mesN).padStart(2, '0')}-01`;
}

// ── Abono ─────────────────────────────────────────────────────────────────────

export interface ValoresAbono {
  bruto: number | null;
  neto: number | null;
  comision: number | null;
  ivaComision: number | null;
  retencionFuente: number | null;
  retencionIva: number | null;
  retencionIca: number | null;
}

const pesos = (v: number | null | undefined) => Math.round(Number.isFinite(v as number) ? (v as number) : 0);

export interface CuadreAbono {
  bruto: number;
  comision: number;
  ivaComision: number;
  retenciones: number;
  netoCalculado: number;
  neto: number | null;
  /** Neto recibido − neto calculado (0 si cuadra). */
  diferencia: number;
  cuadra: boolean;
}

/** Bruto = neto + comisión + IVA de la comisión + retenciones (en pesos, como la base). */
export function cuadreAbono(v: ValoresAbono): CuadreAbono {
  const bruto = pesos(v.bruto);
  const comision = pesos(v.comision);
  const ivaComision = pesos(v.ivaComision);
  const retenciones = pesos(v.retencionFuente) + pesos(v.retencionIva) + pesos(v.retencionIca);
  const netoCalculado = bruto - comision - ivaComision - retenciones;
  const neto = v.neto === null || v.neto === undefined || !Number.isFinite(v.neto) ? null : pesos(v.neto);
  const diferencia = neto === null ? 0 : neto - netoCalculado;
  return {
    bruto,
    comision,
    ivaComision,
    retenciones,
    netoCalculado,
    neto,
    diferencia,
    cuadra: bruto > 0 && neto !== null && netoCalculado > 0 && diferencia === 0,
  };
}

/**
 * Cómo se va a tratar el IVA de la comisión, igual que la base: del exterior →
 * pendiente (reverse charge); sin IVA → nada que tratar; responsable → descontable;
 * no responsable → gasto; sin perfil tributario → no se puede decidir.
 */
export function tratamientoDelIva(
  origen: OrigenProcesador,
  responsableIva: boolean | null,
  ivaComision: number | null,
): TratamientoIva | 'sin_iva' | 'sin_perfil' {
  if (origen === 'exterior') return 'exterior';
  if (pesos(ivaComision) <= 0) return 'sin_iva';
  if (responsableIva === null) return 'sin_perfil';
  return responsableIva ? 'descontable' : 'gasto';
}

/** La factura del procesador solo es obligatoria cuando el IVA va al descontable. */
export function facturaObligatoria(tratamiento: ReturnType<typeof tratamientoDelIva>): boolean {
  return tratamiento === 'descontable' || tratamiento === 'proporcional';
}

export type ErrorAbono = 'procesador' | 'fecha' | 'bruto' | 'neto' | 'descuadre' | 'factura' | 'nit' | 'perfil';

export function erroresAbono(
  v: ValoresAbono,
  ctx: { procesador: CodigoProcesador | null; fecha: string | null; factura: string; nit: string | null; tratamiento: ReturnType<typeof tratamientoDelIva> },
): ErrorAbono[] {
  const errores: ErrorAbono[] = [];
  const c = cuadreAbono(v);
  if (!ctx.procesador) errores.push('procesador');
  else if (!ctx.nit) errores.push('nit');
  if (!ctx.fecha) errores.push('fecha');
  if (c.bruto <= 0) errores.push('bruto');
  if (c.neto === null || c.neto <= 0) errores.push('neto');
  else if (!c.cuadra) errores.push('descuadre');
  if (ctx.tratamiento === 'sin_perfil') errores.push('perfil');
  if (facturaObligatoria(ctx.tratamiento) && !ctx.factura.trim()) errores.push('factura');
  return errores;
}

// ── Errores de la base ───────────────────────────────────────────────────────

const CODIGOS_BASE = [
  'SESION_REQUERIDA',
  'SIN_PERMISO',
  'PROCESADOR_INVALIDO',
  'FECHA_REQUERIDA',
  'FECHA_FUTURA',
  'PERIODO_CERRADO',
  'IMPORTE_INVALIDO',
  'NETO_INVALIDO',
  'NETO_DESCUADRADO',
  'SUCURSAL_INVALIDA',
  'CUENTA_BANCARIA_INVALIDA',
  'PROPORCION_INVALIDA',
  'PROPORCION_NO_APLICA',
  'PERFIL_TRIBUTARIO_REQUERIDO',
  'FACTURA_REQUERIDA',
  'ABONO_MAYOR_QUE_SALDO',
  'NIT_PROCESADOR_REQUERIDO',
  'SIN_CUENTA',
  'SOLICITUD_REQUERIDA',
  'ORIGEN_INVALIDO',
  'RETIENE_SALDO_INVALIDO',
  'ABONO_INEXISTENTE',
  'MOTIVO_REQUERIDO',
] as const;
export type CodigoErrorProcesador = (typeof CODIGOS_BASE)[number] | 'DESCONOCIDO';

/** Lee el código al inicio del mensaje de la base («NETO_DESCUADRADO: …»). */
export function codigoDeError(mensaje: string | null | undefined): CodigoErrorProcesador {
  const m = (mensaje ?? '').trim();
  const codigo = CODIGOS_BASE.find((c) => m === c || m.startsWith(`${c}:`) || m.startsWith(`${c} `));
  return codigo ?? 'DESCONOCIDO';
}

export function esErrorDeUsuario(codigo: CodigoErrorProcesador): boolean {
  return codigo !== 'DESCONOCIDO' && codigo !== 'SESION_REQUERIDA' && codigo !== 'SIN_PERMISO';
}
