/**
 * «Anular devolución» (Figma 05 POS y ventas, sección 873:573997): lo que la
 * pantalla decide con el diagnóstico de `fn_devolucion_anulacion_estado` y lo
 * que manda a `fn_devolucion_anular`. Módulo hoja, sin React ni Supabase.
 *
 * Reglas del Contador (las hace cumplir la RPC; aquí solo se presentan):
 * - Nota crédito ACEPTADA por la DIAN → no se anula; se ofrece «Registrar
 *   venta nueva» (diálogo 2719:190584).
 * - Sin transmitir o rechazada → asiento espejo con fecha de hoy, o con la
 *   fecha original si ese periodo sigue abierto (2719:190434); con el periodo
 *   original cerrado, «Fecha original» queda deshabilitada (2719:190511).
 * - Efectivo: necesita una caja abierta, igual que al crear la devolución.
 */

export type EstadoDianNota = 'aceptada' | 'rechazada' | 'en_envio' | 'sin_transmitir' | 'anulada';
export type CasoAnulacion = 'anulable' | 'nota_aceptada' | 'bloqueada' | 'ya_anulada';
export type FechaEspejo = 'hoy' | 'original';

export interface AsientoAReversar {
  id: number;
  fecha: string | null;
  numero: string;
  memo: string | null;
}

export interface DiagnosticoAnulacion {
  return_id: number;
  estado: string;
  metodo: 'cash' | 'store_credit' | null;
  total: number;
  /** pos.void, resuelto en la base con `fn_tiene_permiso`. */
  tiene_permiso: boolean;
  nota: { id: string; numero: string | null; estado_dian: EstadoDianNota; fecha_aceptacion: string | null } | null;
  /** Días de la organización (YYYY-MM-DD). */
  fecha_original: string;
  hoy: string;
  periodo_original_abierto: boolean;
  periodo_hoy_abierto: boolean;
  caja_abierta: number | null;
  saldo_a_favor: { id: string; usado: boolean } | null;
  asientos: AsientoAReversar[];
  bloqueo: string | null;
  caso: CasoAnulacion;
}

export interface ResultadoAnulacion {
  return_id: number;
  ya_anulada: boolean;
  numero?: string;
  fecha_espejo?: FechaEspejo;
  contra_asientos?: number[];
  asientos_pendientes?: number;
  movimiento_caja?: number | null;
  sesion_caja?: number | null;
  unidades_retiradas?: number;
}

const ESTADOS_DIAN: readonly EstadoDianNota[] = ['aceptada', 'rechazada', 'en_envio', 'sin_transmitir', 'anulada'];
const CASOS: readonly CasoAnulacion[] = ['anulable', 'nota_aceptada', 'bloqueada', 'ya_anulada'];
const FECHA_PLANA = /^\d{4}-\d{2}-\d{2}$/;

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const fechaPlana = (v: unknown): string => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return FECHA_PLANA.test(s) ? s : '';
};

/** El JSON de la RPC con tipos seguros (lo que falte queda en su valor más prudente). */
export function normalizarDiagnostico(crudo: unknown): DiagnosticoAnulacion {
  const d = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  const nota = d.nota && typeof d.nota === 'object' ? (d.nota as Record<string, unknown>) : null;
  const saldo = d.saldo_a_favor && typeof d.saldo_a_favor === 'object' ? (d.saldo_a_favor as Record<string, unknown>) : null;
  const estadoDian = ESTADOS_DIAN.find((e) => e === nota?.estado_dian) ?? 'sin_transmitir';
  const caso = CASOS.find((c) => c === d.caso) ?? 'bloqueada';
  return {
    return_id: num(d.return_id),
    estado: texto(d.estado) ?? 'processed',
    metodo: d.metodo === 'cash' || d.metodo === 'store_credit' ? d.metodo : null,
    total: num(d.total),
    tiene_permiso: d.tiene_permiso === true,
    nota: nota && texto(nota.id)
      ? { id: String(nota.id), numero: texto(nota.numero), estado_dian: estadoDian, fecha_aceptacion: texto(nota.fecha_aceptacion) }
      : null,
    fecha_original: fechaPlana(d.fecha_original),
    hoy: fechaPlana(d.hoy),
    periodo_original_abierto: d.periodo_original_abierto === true,
    periodo_hoy_abierto: d.periodo_hoy_abierto === true,
    caja_abierta: d.caja_abierta === null || d.caja_abierta === undefined ? null : num(d.caja_abierta) || null,
    saldo_a_favor: saldo && texto(saldo.id) ? { id: String(saldo.id), usado: saldo.usado === true } : null,
    asientos: Array.isArray(d.asientos)
      ? (d.asientos as Array<Record<string, unknown>>).map((a) => ({
          id: num(a.id),
          fecha: texto(a.fecha),
          numero: texto(a.numero) ?? `#${num(a.id)}`,
          memo: texto(a.memo),
        }))
      : [],
    bloqueo: texto(d.bloqueo),
    caso,
  };
}

/**
 * Qué diálogo se abre: `anular` (2719:190434 / 2719:190511), `no_se_puede`
 * (nota aceptada, 2719:190584) o `bloqueada` (otro impedimento, con su razón).
 */
export type DialogoAnulacion = 'anular' | 'no_se_puede' | 'bloqueada';

export function dialogoAnulacion(d: Pick<DiagnosticoAnulacion, 'caso' | 'tiene_permiso'>): DialogoAnulacion {
  if (d.caso === 'nota_aceptada') return 'no_se_puede';
  if (!d.tiene_permiso || d.caso !== 'anulable') return 'bloqueada';
  return 'anular';
}

/** Por qué no se puede anular (código de error de la RPC), o null si se puede. */
export function bloqueoAnulacion(d: Pick<DiagnosticoAnulacion, 'caso' | 'tiene_permiso' | 'bloqueo'>): CodigoErrorAnulacion | null {
  if (d.caso === 'anulable' && d.tiene_permiso) return null;
  if (d.caso === 'anulable') return 'sin_permiso';
  if (d.caso === 'ya_anulada') return 'ya_anulada';
  return codigoErrorAnulacion({ message: d.bloqueo ?? '' });
}

export interface OpcionesFechaEspejo {
  hoy: boolean;
  original: boolean;
  /** La opción marcada al abrir: «Hoy» si se puede (Figma), si no la original. */
  inicial: FechaEspejo | null;
  /** Qué ayuda va bajo el control. */
  ayuda: 'original_abierto' | 'mismo_mes' | 'original_cerrado' | 'hoy_cerrado' | 'ambos_cerrados';
}

export function opcionesFechaEspejo(
  d: Pick<DiagnosticoAnulacion, 'periodo_original_abierto' | 'periodo_hoy_abierto' | 'fecha_original' | 'hoy'>,
): OpcionesFechaEspejo {
  const hoy = d.periodo_hoy_abierto;
  const original = d.periodo_original_abierto;
  const inicial: FechaEspejo | null = hoy ? 'hoy' : original ? 'original' : null;
  const mismoMes = !!d.fecha_original && d.fecha_original.slice(0, 7) === d.hoy.slice(0, 7);
  const ayuda = !hoy && !original ? 'ambos_cerrados' : !original ? 'original_cerrado' : !hoy ? 'hoy_cerrado' : mismoMes ? 'mismo_mes' : 'original_abierto';
  return { hoy, original, inicial, ayuda };
}

/** Mes y año de un día de la organización («septiembre de 2026»), sin pasar por la zona del navegador. */
export function mesDeFecha(fecha: string, locale: string): string {
  if (!FECHA_PLANA.test(fecha)) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  const texto = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d, 12)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Día de la organización con formato corto («23 sep 2026»). */
export function diaDeFecha(fecha: string, locale: string): string {
  if (!FECHA_PLANA.test(fecha)) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d, 12)));
}

/**
 * «Qué se revierte»: las líneas del diálogo, en el orden del Figma. Cada una es
 * una clave de `posDevolucionesAnular.consecuencias` con sus valores.
 */
export type Consecuencia =
  | { clave: 'asientos'; numeros: string }
  | { clave: 'sinAsientos' }
  | { clave: 'inventario'; unidades: number; productos: string }
  | { clave: 'notaRechazada' | 'notaSinTransmitir'; numero: string }
  | { clave: 'caja'; sesion: number }
  | { clave: 'cajaSinSesion' }
  | { clave: 'saldo' }
  | { clave: 'venta' };

export function consecuenciasAnulacion(
  d: Pick<DiagnosticoAnulacion, 'asientos' | 'nota' | 'metodo' | 'caja_abierta' | 'saldo_a_favor'>,
  lineas: ReadonlyArray<{ nombre: string | null; cantidad: number; repuesta: boolean }>,
): Consecuencia[] {
  const salida: Consecuencia[] = [];
  salida.push(d.asientos.length ? { clave: 'asientos', numeros: d.asientos.map((a) => a.numero).join(', ') } : { clave: 'sinAsientos' });
  const repuestas = lineas.filter((l) => l.repuesta && l.cantidad > 0);
  if (repuestas.length) {
    salida.push({
      clave: 'inventario',
      unidades: Math.round(repuestas.reduce((a, l) => a + l.cantidad, 0) * 1000) / 1000,
      productos: [...new Set(repuestas.map((l) => l.nombre).filter((n): n is string => !!n))].join(', '),
    });
  }
  if (d.nota && (d.nota.estado_dian === 'rechazada' || d.nota.estado_dian === 'sin_transmitir')) {
    salida.push({ clave: d.nota.estado_dian === 'rechazada' ? 'notaRechazada' : 'notaSinTransmitir', numero: d.nota.numero ?? '—' });
  }
  if (d.metodo === 'cash') salida.push(d.caja_abierta ? { clave: 'caja', sesion: d.caja_abierta } : { clave: 'cajaSinSesion' });
  if (d.saldo_a_favor) salida.push({ clave: 'saldo' });
  salida.push({ clave: 'venta' });
  return salida;
}

// ─── «Reenviar nota crédito a la DIAN» (menú ⋯ del detalle) ────────────────

/** Estados del envío (`electronic_invoicing_jobs.status`) en que se ofrece reenviar. */
export const ESTADOS_ENVIO_REENVIABLES = ['rejected', 'failed'] as const;

export type ReenvioNota = { visible: false } | { visible: true; jobId: string; permitido: boolean };

/**
 * Solo cuando la DIAN rechazó la nota o su envío falló: nunca aceptada, nunca
 * en envío, nunca anulada. Reutiliza el reintento de la cola
 * (`POST /api/factus/jobs`, `fn_einvoicing_accion_manual`), que vuelve a
 * exigir el estado y el permiso `finance.create` en el servidor.
 */
export function reenvioNotaCredito(
  nota: { estado: string | null; einvoice_status: string | null; envio?: { job_id: string; estado: string } | null } | null,
  opciones: { anulada: boolean; permiso: boolean },
): ReenvioNota {
  if (!nota?.envio || opciones.anulada) return { visible: false };
  if (nota.einvoice_status === 'accepted' || ['void', 'voided', 'cancelled'].includes(String(nota.estado))) return { visible: false };
  if (!(ESTADOS_ENVIO_REENVIABLES as readonly string[]).includes(nota.envio.estado)) return { visible: false };
  return { visible: true, jobId: nota.envio.job_id, permitido: opciones.permiso };
}

// ─── Cuerpo de la petición y errores ────────────────────────────────────────

export const MOTIVO_MINIMO_ANULACION = 5;
export const MOTIVO_MAXIMO_ANULACION = 500;

/** Lo que el route handler acepta: motivo y fecha del espejo. La organización NUNCA viene de aquí. */
export function cuerpoAnulacion(crudo: unknown): { motivo: string; fecha_espejo: FechaEspejo } | { error: 'motivo_obligatorio' | 'fecha_espejo_invalida' } {
  const c = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  const motivo = typeof c.motivo === 'string' ? c.motivo.replace(/\s+/g, ' ').trim() : '';
  if (Array.from(motivo).length < MOTIVO_MINIMO_ANULACION) return { error: 'motivo_obligatorio' };
  const fecha = c.fecha_espejo ?? 'hoy';
  if (fecha !== 'hoy' && fecha !== 'original') return { error: 'fecha_espejo_invalida' };
  return { motivo: Array.from(motivo).slice(0, MOTIVO_MAXIMO_ANULACION).join(''), fecha_espejo: fecha };
}

/** Códigos que lanzan `fn_devolucion_anular` / `fn_devolucion_anulacion_estado`. */
export const CODIGOS_ERROR_ANULACION = [
  'motivo_obligatorio',
  'fecha_espejo_invalida',
  'devolucion_no_encontrada',
  'devolucion_invalida',
  'sin_acceso_sucursal',
  'sin_permiso',
  'ya_anulada',
  'estado_invalido',
  'nota_aceptada_dian',
  'nota_en_envio_dian',
  'nota_ya_anulada',
  'devolucion_de_garantia',
  'devolucion_con_membresia',
  'saldo_a_favor_aplicado',
  'serial_no_disponible',
  'periodo_cerrado',
  'periodo_original_cerrado',
  'periodo_hoy_cerrado',
  'efectivo_sin_caja',
  'stock_insuficiente',
] as const;

export type CodigoErrorAnulacion = (typeof CODIGOS_ERROR_ANULACION)[number] | 'generico';

export function codigoErrorAnulacion(error: unknown): CodigoErrorAnulacion {
  const mensaje =
    typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message ?? '').trim() : '';
  const exacto = CODIGOS_ERROR_ANULACION.find((c) => mensaje === c);
  if (exacto) return exacto;
  // El disparador de periodo de journal_entries lanza 'periodo_cerrado' con su propio texto.
  if (/periodo_cerrado/i.test(mensaje)) return 'periodo_cerrado';
  if (/stock_insuficiente/i.test(mensaje)) return 'stock_insuficiente';
  if (/Acceso denegado|no pertenece/i.test(mensaje)) return 'sin_acceso_sucursal';
  return 'generico';
}

/** HTTP del route handler para cada código. */
export function estadoHttpAnulacion(codigo: CodigoErrorAnulacion): number {
  switch (codigo) {
    case 'motivo_obligatorio':
    case 'fecha_espejo_invalida':
    case 'devolucion_invalida':
      return 400;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
      return 403;
    case 'devolucion_no_encontrada':
      return 404;
    case 'generico':
      return 500;
    default:
      return 409;
  }
}

/** Clave de traducción `posDevolucionesAnular.errores.<clave>` (camelCase). */
export function claveErrorAnulacion(codigo: CodigoErrorAnulacion): string {
  return codigo.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
}
