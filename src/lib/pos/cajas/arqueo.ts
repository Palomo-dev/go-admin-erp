/**
 * Arqueo de caja: lo que el navegador manda y cómo se lee lo que devuelve el
 * servidor. Módulo hoja, sin dependencias, para probarlo sin Supabase.
 *
 * Antes (hasta 2026-09-23) `CajasService.createCashCount` mandaba `difference`
 * en el insert de `cash_counts`, columna `GENERATED ALWAYS` → Postgres 428C9 y
 * **0 arqueos guardados en toda la base**. Además mezclaba métodos: sumaba
 * efectivo + tarjeta + transferencias y lo comparaba con el esperado de
 * efectivo.
 *
 * Ahora el navegador manda SOLO lo contado; `pos_caja_registrar_arqueo`
 * calcula el esperado en el servidor (`pos_caja_esperado`) y compara efectivo
 * contra efectivo y cada método contra su propio esperado.
 */

export type TipoArqueo = 'opening' | 'partial' | 'closing';

export interface ParametrosArqueo {
  p_session_id: number;
  p_tipo: TipoArqueo;
  p_efectivo_contado: number;
  p_contado_por_metodo: Record<string, number>;
  p_denominaciones: object | null;
  p_notas: string | null;
}

const TIPOS: readonly TipoArqueo[] = ['opening', 'partial', 'closing'];

function importe(valor: unknown): number | null {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Parámetros de `pos_caja_registrar_arqueo`. Descarta el método `cash` del
 * conteo por método (el efectivo va aparte, por denominaciones) y los montos
 * vacíos o inválidos. Nunca incluye esperado ni diferencia.
 */
export function parametrosArqueo(
  sessionId: number,
  datos: {
    count_type: TipoArqueo;
    counted_amount: number;
    counted_by_method?: Record<string, number>;
    denominations?: object;
    notes?: string;
  },
): ParametrosArqueo {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new Error('Caja inválida para el arqueo');
  }
  if (!TIPOS.includes(datos.count_type)) {
    throw new Error('Tipo de arqueo inválido');
  }
  const efectivo = importe(datos.counted_amount);
  if (efectivo === null) {
    throw new Error('Efectivo contado inválido');
  }
  const porMetodo: Record<string, number> = {};
  for (const [codigo, monto] of Object.entries(datos.counted_by_method ?? {})) {
    if (!codigo || codigo === 'cash') continue;
    const valor = importe(monto);
    if (valor === null || valor === 0) continue;
    porMetodo[codigo] = valor;
  }
  const denominaciones = datos.denominations && Object.keys(datos.denominations).length > 0 ? datos.denominations : null;
  const notas = datos.notes?.trim() ? datos.notes : null;
  return {
    p_session_id: sessionId,
    p_tipo: datos.count_type,
    p_efectivo_contado: efectivo,
    p_contado_por_metodo: porMetodo,
    p_denominaciones: denominaciones,
    p_notas: notas,
  };
}

export interface ParametrosCierre {
  p_session_id: number;
  p_efectivo_contado: number;
  p_contado_por_metodo: Record<string, number>;
  p_denominaciones: object | null;
  p_notas: string | null;
  p_cerrada_en: string | null;
}

/**
 * Parámetros de `pos_caja_cerrar` (cierre en una transacción con el arqueo
 * `closing`). Mismas reglas que el arqueo: solo lo contado, `cash` fuera del
 * mapa por método; `cerradaEn` solo para el cierre hecho sin red.
 */
export function parametrosCierre(
  sessionId: number,
  datos: {
    counted_amount: number;
    counted_by_method?: Record<string, number>;
    denominations?: object;
    notes?: string;
  },
  cerradaEn?: string | null,
): ParametrosCierre {
  const a = parametrosArqueo(sessionId, { ...datos, count_type: 'closing' });
  return {
    p_session_id: a.p_session_id,
    p_efectivo_contado: a.p_efectivo_contado,
    p_contado_por_metodo: a.p_contado_por_metodo,
    p_denominaciones: a.p_denominaciones,
    p_notas: a.p_notas,
    p_cerrada_en: cerradaEn ?? null,
  };
}

/** Diferencia del efectivo: contado − esperado. Positiva = sobrante. */
export function diferenciaEfectivo(contado: number, esperado: number): number {
  return Math.round((contado - esperado) * 100) / 100;
}

export interface TotalesConteo {
  efectivoContado: number;
  otrosContado: number;
  totalContado: number;
  /** `null` en cierre ciego. */
  totalEsperado: number | null;
  /** Total contado − total esperado (todos los métodos). `null` en cierre ciego. */
  diferenciaTotal: number | null;
  /** Lo que se guarda en `cash_counts.difference`: solo efectivo. */
  diferenciaEfectivo: number | null;
}

/** Totales del resumen del arqueo y del cierre a partir de las filas por método. */
export function totalesConteo(filas: readonly FilaConteoMetodo[]): TotalesConteo {
  const r = (n: number) => Math.round(n * 100) / 100;
  const efectivo = filas.find((f) => f.metodo === 'cash');
  const efectivoContado = r(efectivo?.contado ?? 0);
  const otrosContado = r(filas.filter((f) => f.metodo !== 'cash').reduce((s, f) => s + (f.contado ?? 0), 0));
  const totalContado = r(efectivoContado + otrosContado);
  const hayEsperado = filas.length > 0 && filas.every((f) => f.esperado !== null);
  const totalEsperado = hayEsperado ? r(filas.reduce((s, f) => s + (f.esperado ?? 0), 0)) : null;
  return {
    efectivoContado,
    otrosContado,
    totalContado,
    totalEsperado,
    diferenciaTotal: totalEsperado === null ? null : r(totalContado - totalEsperado),
    diferenciaEfectivo: efectivo && efectivo.esperado !== null ? r(efectivoContado - efectivo.esperado) : null,
  };
}

/** Con una diferencia visible (≥ 0,5 en valor absoluto) la observación es obligatoria. */
export function observacionObligatoria(diferencia: number | null): boolean {
  return diferencia !== null && Math.abs(diferencia) >= 0.5;
}

/** Una fila del conteo por método tal como la pinta la pantalla. */
export interface FilaConteoMetodo {
  metodo: string;
  /** `null` = oculto por cierre ciego (el servidor no lo mandó). */
  esperado: number | null;
  /** `null` = no contado. */
  contado: number | null;
  /** `null` = sin esperado visible o sin conteo. */
  diferencia: number | null;
}

/**
 * Filas del arqueo por método: efectivo primero y luego cada método con
 * esperado o con conteo, en orden alfabético. Mismo criterio que
 * `pos_caja_registrar_arqueo` al armar `method_breakdown`: un método con
 * esperado y sin conteo se muestra sin juzgar (diferencia `null`); cada
 * método se compara contra su propio esperado, nunca contra el total.
 *
 * `esperadoPorMetodo` es `pos_caja_esperado.por_metodo` (incluye `cash` =
 * efectivo esperado) o `null` en cierre ciego.
 */
export function diferenciasPorMetodo(
  esperadoPorMetodo: Record<string, number> | null,
  contado: Record<string, number | null | undefined>,
  /** Métodos activos de la organización: aparecen aunque no tengan esperado (cierre ciego, sin ventas). */
  metodosActivos: readonly string[] = [],
): FilaConteoMetodo[] {
  const metodos = new Set<string>(['cash']);
  for (const k of metodosActivos) if (k) metodos.add(k);
  for (const k of Object.keys(esperadoPorMetodo ?? {})) metodos.add(k);
  for (const [k, v] of Object.entries(contado)) if (v != null) metodos.add(k);
  const orden = ['cash', ...[...metodos].filter((m) => m !== 'cash').sort()];
  return orden.map((metodo) => {
    const esperado = esperadoPorMetodo ? Number(esperadoPorMetodo[metodo] ?? 0) : null;
    const c = contado[metodo];
    const cont = c == null || !Number.isFinite(Number(c)) ? null : Number(c);
    return {
      metodo,
      esperado,
      contado: cont,
      diferencia: esperado === null || cont === null ? null : diferenciaEfectivo(cont, esperado),
    };
  });
}
