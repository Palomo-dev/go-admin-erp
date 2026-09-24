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

/** Diferencia del efectivo: contado − esperado. Positiva = sobrante. */
export function diferenciaEfectivo(contado: number, esperado: number): number {
  return Math.round((contado - esperado) * 100) / 100;
}
