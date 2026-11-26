/**
 * «Caja — lo que sale entre turnos» (encargo del dueño 2026-11-25, Figma
 * EAvjINVRnlzFM70GVoWXgl sección 3316:209317). Módulo hoja, sin dependencias:
 * lo usan los route handlers (`/api/pos/cajas/[id]/cerrar`, `/apertura`,
 * `/[id]/descuadre`) y, en la fase 2, las pantallas.
 *
 * La base de datos es la que manda (`pos_caja_cerrar_turno`, `pos_caja_abrir`,
 * migración 20261126070000): aquí solo se arma lo que se le manda y se lee lo
 * que devuelve, con las mismas reglas, para que la pantalla no ofrezca lo que
 * el servidor va a negar.
 *
 * Cierre ciego: el cajero reparte lo que CONTÓ (lo único que conoce). El
 * esperado, la diferencia y el estado del descuadre solo viajan a quien tiene
 * `pos.cajas.ver_esperado`; `leerCierreTurno` vuelve a quitarlos si la base
 * marcó `oculto`, de modo que ninguna respuesta de la ruta los filtra.
 */

export const TIPOS_DESTINO = ['base', 'consignar', 'trasladar', 'dueno', 'gasto', 'sin_soporte'] as const;
export type TipoDestino = (typeof TIPOS_DESTINO)[number];

/** Un destino del efectivo contado, tal como lo recibe `pos_caja_cerrar_turno`. */
export interface DestinoEfectivo {
  tipo: TipoDestino;
  monto: number;
  /** consignar: cuenta bancaria (bank_accounts.id). */
  cuenta_banco_id?: number;
  /** consignar / gasto: ruta del soporte en el bucket (`<org>/<uuid>.<ext>`). Obligatorio. */
  soporte_path?: string;
  /** consignar: n.º de comprobante · gasto: n.º de factura. */
  referencia?: string;
  /** trasladar: la otra caja ABIERTA de la organización. */
  sesion_destino_id?: number;
  /** gasto: cuenta 51/52 de movimiento. */
  cuenta_gasto?: string;
  /** dueño (sociedad) o gasto: cédula/NIT y nombre del tercero. */
  tercero_nit?: string;
  tercero_nombre?: string;
  nota?: string;
}

/** Errores de validación de los destinos (mismos códigos que lanza la base). */
export type ErrorDestinos =
  | 'destinos_invalidos'
  | 'destino_invalido'
  | 'destino_sin_monto'
  | 'consignacion_sin_cuenta'
  | 'consignacion_sin_soporte'
  | 'traslado_sin_caja'
  | 'gasto_sin_cuenta'
  | 'gasto_sin_soporte'
  | 'destinos_no_suman';

const centavos = (n: number) => Math.round(n * 100);
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Suma de los destinos, redondeada a centavos. */
export function sumaDestinos(destinos: readonly Pick<DestinoEfectivo, 'monto'>[]): number {
  return redondear(destinos.reduce((s, d) => s + (Number.isFinite(d.monto) ? d.monto : 0), 0));
}

/** Lo que falta (positivo) o sobra (negativo) por repartir frente a lo contado. */
export function porRepartir(contado: number, destinos: readonly Pick<DestinoEfectivo, 'monto'>[]): number {
  return redondear(contado - sumaDestinos(destinos));
}

/**
 * Valida los destinos con las reglas de `pos_caja_cerrar_turno`: tipo
 * conocido, monto > 0 (la base puede ser 0), datos obligatorios por tipo y
 * suma igual a lo contado. Devuelve el primer error o `null`.
 */
export function validarDestinos(contado: number, destinos: readonly DestinoEfectivo[]): ErrorDestinos | null {
  if (!Array.isArray(destinos) || destinos.length > 20) return 'destinos_invalidos';
  for (const d of destinos) {
    if (!d || typeof d !== 'object') return 'destinos_invalidos';
    if (!(TIPOS_DESTINO as readonly string[]).includes(d.tipo)) return 'destino_invalido';
    if (typeof d.monto !== 'number' || !Number.isFinite(d.monto) || d.monto < 0 || d.monto > 1e12) return 'destino_sin_monto';
    if (d.monto === 0 && d.tipo !== 'base') return 'destino_sin_monto';
    if (d.tipo === 'consignar') {
      if (typeof d.cuenta_banco_id !== 'number') return 'consignacion_sin_cuenta';
      if (!d.soporte_path?.trim()) return 'consignacion_sin_soporte';
    } else if (d.tipo === 'trasladar') {
      if (typeof d.sesion_destino_id !== 'number') return 'traslado_sin_caja';
    } else if (d.tipo === 'gasto') {
      if (!/^5[12][0-9]*$/.test(d.cuenta_gasto ?? '')) return 'gasto_sin_cuenta';
      if (!d.soporte_path?.trim()) return 'gasto_sin_soporte';
    }
  }
  if (centavos(sumaDestinos(destinos)) !== centavos(contado)) return 'destinos_no_suman';
  return null;
}

/** «Dejar todo como base»: un clic, todo lo contado se queda en la caja. */
export function todoComoBase(contado: number): DestinoEfectivo[] {
  return [{ tipo: 'base', monto: redondear(Math.max(0, contado)) }];
}

/**
 * Reparto propuesto al cerrar cuando la caja tiene tope de efectivo: deja como
 * base hasta el tope y propone consignar el exceso. Sin tope (o sin exceso),
 * todo queda como base. Nunca bloquea: es solo la propuesta inicial.
 */
export function propuestaConTope(contado: number, tope: number | null): { base: number; exceso: number } {
  const c = redondear(Math.max(0, contado));
  if (tope === null || !Number.isFinite(tope) || tope <= 0 || c <= tope) return { base: c, exceso: 0 };
  return { base: redondear(tope), exceso: redondear(c - tope) };
}

/** Parámetros de `pos_caja_cerrar_turno`. El `cash` va aparte, como en el arqueo. */
export interface ParametrosCierreTurno {
  p_session_id: number;
  p_efectivo_contado: number;
  p_destinos: DestinoEfectivo[];
  p_contado_por_metodo: Record<string, number>;
  p_denominaciones: object | null;
  p_notas: string | null;
  p_faltante_cajero: boolean;
}

export function parametrosCierreTurno(
  sessionId: number,
  datos: {
    counted_amount: number;
    destinos: DestinoEfectivo[];
    counted_by_method?: Record<string, number>;
    denominations?: object | null;
    notes?: string | null;
    faltante_cajero?: boolean;
  },
): ParametrosCierreTurno {
  const porMetodo: Record<string, number> = {};
  for (const [k, v] of Object.entries(datos.counted_by_method ?? {})) {
    if (!k || k === 'cash' || !Number.isFinite(v) || v <= 0) continue;
    porMetodo[k] = redondear(v);
  }
  return {
    p_session_id: sessionId,
    p_efectivo_contado: redondear(datos.counted_amount),
    p_destinos: datos.destinos.map((d) => ({ ...d, monto: redondear(d.monto) })),
    p_contado_por_metodo: porMetodo,
    p_denominaciones: datos.denominations && Object.keys(datos.denominations).length > 0 ? datos.denominations : null,
    p_notas: datos.notes?.trim() ? datos.notes : null,
    p_faltante_cajero: datos.faltante_cajero === true,
  };
}

export type EstadoDescuadre = 'sin_novedad' | 'por_revisar' | 'aprobado';

/** Lo que la ruta devuelve tras `pos_caja_cerrar_turno`. */
export type ResultadoCierreTurno =
  | {
      estado: 'reconteo';
      sessionId: number;
      /** Solo sin cierre ciego (o con permiso): el cajero ve cuánto no cuadra. */
      diferencia: number | null;
      esperado: number | null;
      tolerancia: number | null;
      oculto: boolean;
    }
  | {
      estado: 'cerrada';
      sessionId: number;
      baseDejada: number;
      contado: number;
      diferencia: number | null;
      esperado: number | null;
      descuadre: EstadoDescuadre | null;
      faltanteACargo: 'tienda' | 'cajero' | null;
      oculto: boolean;
    }
  | { estado: 'ya_cerrada'; sessionId: number };

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee la respuesta de `pos_caja_cerrar_turno`. Con `oculto` (cierre ciego sin
 * permiso) descarta esperado, diferencia, tolerancia, descuadre y a cargo de
 * quién quedó el faltante aunque la base los mandara: el cajero solo ve
 * «Conteo registrado» o «Vuelve a contar».
 */
export function leerCierreTurno(raw: unknown): ResultadoCierreTurno {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sessionId = num(r.session_id) ?? 0;
  if (r.estado === 'ya_cerrada' || r.ya_cerrada === true) return { estado: 'ya_cerrada', sessionId };
  const oculto = r.oculto !== false;
  if (r.estado === 'reconteo') {
    return {
      estado: 'reconteo',
      sessionId,
      diferencia: oculto ? null : num(r.difference),
      esperado: oculto ? null : num(r.expected_amount),
      tolerancia: oculto ? null : num(r.tolerancia),
      oculto,
    };
  }
  const descuadre = r.descuadre_estado;
  const aCargo = r.faltante_a_cargo;
  return {
    estado: 'cerrada',
    sessionId,
    baseDejada: num(r.base_dejada) ?? 0,
    contado: num(r.final_amount) ?? 0,
    diferencia: oculto ? null : num(r.difference),
    esperado: oculto ? null : num(r.expected_amount),
    descuadre: oculto || (descuadre !== 'sin_novedad' && descuadre !== 'por_revisar' && descuadre !== 'aprobado') ? null : descuadre,
    faltanteACargo: oculto || (aCargo !== 'tienda' && aCargo !== 'cajero') ? null : aCargo,
    oculto,
  };
}

/**
 * Tolerancia y reconteo, la misma regla que la base (para pruebas y para
 * explicar el comportamiento): dentro de la tolerancia, sin novedad; por
 * encima, la primera vez se pide reconteo; si persiste, cierra «por revisar».
 */
export function decisionDescuadre(
  diferencia: number,
  tolerancia: number,
  reconteoYaPedido: boolean,
): 'sin_novedad' | 'reconteo' | 'por_revisar' {
  if (Math.abs(diferencia) <= tolerancia) return 'sin_novedad';
  return reconteoYaPedido ? 'por_revisar' : 'reconteo';
}

// ── Apertura ───────────────────────────────────────────────────────────────

export const MOTIVOS_DIFERENCIA_APERTURA = [
  'error_conteo',
  'consignacion',
  'retiro_dueno',
  'aporte_dueno',
  'gasto',
  'traslado',
  'no_se',
] as const;
export type MotivoDiferenciaApertura = (typeof MOTIVOS_DIFERENCIA_APERTURA)[number];

export type OrigenBase =
  | { tipo: 'banco'; cuenta_banco_id: number; referencia: string; soporte_path?: string }
  | { tipo: 'dueno' }
  | { tipo: 'traslado'; sesion_origen_id: number };

/** Diferencia de apertura (monto − base sugerida); `null` si cuadra (< 0,5) o es la primera apertura. */
export function diferenciaApertura(monto: number, baseSugerida: number | null): number | null {
  if (baseSugerida === null || !Number.isFinite(baseSugerida)) return null;
  const d = redondear(monto - baseSugerida);
  return Math.abs(d) < 0.5 ? null : d;
}

/** Motivos que tienen sentido según el sentido de la diferencia (retiro solo si falta; aporte solo si sobra). */
export function motivosPara(diferencia: number): MotivoDiferenciaApertura[] {
  return MOTIVOS_DIFERENCIA_APERTURA.filter((m) =>
    m === 'retiro_dueno' ? diferencia < 0 : m === 'aporte_dueno' ? diferencia > 0 : true,
  );
}

/** Un motivo de retiro/aporte del dueño deja la diferencia explicada; el resto queda «por explicar». */
export function estadoDiferenciaApertura(motivo: MotivoDiferenciaApertura): 'explicada' | 'por_explicar' {
  return motivo === 'retiro_dueno' || motivo === 'aporte_dueno' ? 'explicada' : 'por_explicar';
}

/**
 * Cuenta de la contrapartida según el tipo de organización (decisión 8):
 * persona natural → 3130 (retiro y salida sin soporte); sociedad → 2380 el
 * retiro y 1325 la salida sin soporte; la salida sin soporte de una caja que
 * manejaba otra persona → 136525. Lo decide la base (`fn_caja_turno_contrapartida`);
 * aquí solo se muestra en la tabla «Asientos que se van a generar».
 */
export function cuentaContrapartida(
  destino: 'dueno' | 'sin_soporte',
  tipoPersona: 'natural' | 'sociedad',
  manejabaOtraPersona: boolean,
): '3130' | '2380' | '1325' | '136525' {
  if (destino === 'sin_soporte' && manejabaOtraPersona) return '136525';
  if (tipoPersona === 'natural') return '3130';
  return destino === 'dueno' ? '2380' : '1325';
}

/** Códigos de error de las RPC de caja entre turnos que la ruta traduce (`cajas.errores.<codigo>`). */
export const CODIGOS_ERROR_TURNO = [
  'destinos_invalidos',
  'destino_invalido',
  'destino_sin_monto',
  'consignacion_sin_cuenta',
  'consignacion_sin_soporte',
  'traslado_sin_caja',
  'traslado_caja_invalida',
  'gasto_sin_cuenta',
  'gasto_sin_soporte',
  'destinos_no_suman',
  'falta_socio',
  'motivo_requerido',
  'motivo_no_coincide',
  'origen_requerido',
  'origen_banco_incompleto',
  'monto_invalido',
  'sin_sucursal',
  'nota_requerida',
  'descuadre_no_pendiente',
  'cuenta_no_encontrada',
  'cuenta_inactiva',
  'moneda_distinta',
  'tercero_requerido',
  'soporte_invalido',
] as const;
export type CodigoErrorTurno = (typeof CODIGOS_ERROR_TURNO)[number];

/** El código de la RPC si es uno conocido (el mensaje de Postgres empieza por él). */
export function codigoErrorTurno(mensaje: string | undefined | null): CodigoErrorTurno | null {
  const m = (mensaje ?? '').trim();
  const codigo = CODIGOS_ERROR_TURNO.find((c) => m === c || m.startsWith(`${c}:`) || m.startsWith(`${c} `));
  return codigo ?? null;
}
