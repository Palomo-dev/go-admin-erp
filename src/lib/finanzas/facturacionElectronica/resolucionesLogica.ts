/**
 * Resoluciones y numeración (Figma `52-documentos-resoluciones-listo.png`;
 * docs/design/FINANZAS-DOCUMENTOS-V2.md §7.6). Lógica pura: consumo, lo que
 * queda, vigencia y avisos de cada rango de `invoice_sequences`.
 *
 * `current_number` es el ÚLTIMO número usado (0 = ninguno): así lo escribe
 * `fn_get_next_invoice_number`, que toma `range_start` si vale 0 y si no
 * `current_number + 1`, y falla cuando pasaría de `range_end`.
 */

export interface RangoNumeracion {
  id: number;
  branch_id: number | null;
  document_type: string;
  prefix: string | null;
  resolution_number: string | null;
  resolution_date: string | null;
  range_start: number | null;
  range_end: number | null;
  current_number: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  alert_threshold: number | null;
  factus_numbering_range_id?: number | null;
}

/** Notas crédito y débito: numeración propia, sin resolución de la DIAN. */
export const TIPOS_SIN_RESOLUCION = ['credit_note', 'debit_note'] as const;

export function requiereResolucion(tipo: string): boolean {
  return !(TIPOS_SIN_RESOLUCION as readonly string[]).includes(tipo);
}

export interface ConsumoRango {
  usados: number;
  total: number;
  quedan: number;
  /** 0–100. */
  porcentaje: number;
}

export function consumoRango(r: Pick<RangoNumeracion, 'range_start' | 'range_end' | 'current_number'>): ConsumoRango {
  const inicio = Math.max(0, Number(r.range_start ?? 0));
  const fin = Math.max(0, Number(r.range_end ?? 0));
  const actual = Math.max(0, Number(r.current_number ?? 0));
  const total = fin >= inicio && fin > 0 ? fin - inicio + 1 : 0;
  const usados = actual === 0 || total === 0 ? 0 : Math.min(total, Math.max(0, actual - inicio + 1));
  const quedan = Math.max(0, total - usados);
  const porcentaje = total === 0 ? 0 : Math.round((usados / total) * 1000) / 10;
  return { usados, total, quedan, porcentaje };
}

/** Días entre dos días `YYYY-MM-DD` (b − a), en calendario, sin zona horaria. */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export type EstadoRango = 'vigente' | 'por_agotar' | 'por_vencer' | 'agotada' | 'vencida' | 'inactiva' | 'futura';

export const TONO_RANGO: Readonly<Record<EstadoRango, 'exito' | 'advertencia' | 'peligro' | 'neutro' | 'informacion'>> = {
  vigente: 'exito',
  por_agotar: 'advertencia',
  por_vencer: 'advertencia',
  agotada: 'peligro',
  vencida: 'peligro',
  inactiva: 'neutro',
  futura: 'informacion',
};

/** Umbrales de aviso por vencimiento (días). */
export const AVISOS_VENCIMIENTO = [30, 15, 7] as const;

export interface LecturaRango {
  estado: EstadoRango;
  consumo: ConsumoRango;
  /** Días hasta `valid_until` (negativo si ya venció); null sin vencimiento. */
  diasParaVencer: number | null;
  /** Umbral de 30, 15 o 7 días que alcanzó; null si falta más o no vence. */
  umbralVencimiento: (typeof AVISOS_VENCIMIENTO)[number] | null;
}

export function leerRango(r: RangoNumeracion, hoy: string): LecturaRango {
  const consumo = consumoRango(r);
  const diasParaVencer = r.valid_until ? diasEntre(hoy, r.valid_until) : null;
  const umbralVencimiento =
    diasParaVencer === null || diasParaVencer < 0 ? null : [...AVISOS_VENCIMIENTO].reverse().find((u) => diasParaVencer <= u) ?? null;
  const umbralConsumo = Math.max(0, Number(r.alert_threshold ?? 0));

  let estado: EstadoRango;
  if (!r.is_active) estado = 'inactiva';
  else if (diasParaVencer !== null && diasParaVencer < 0) estado = 'vencida';
  else if (r.valid_from && diasEntre(hoy, r.valid_from) > 0) estado = 'futura';
  else if (consumo.total > 0 && consumo.quedan === 0) estado = 'agotada';
  else if (consumo.total > 0 && umbralConsumo > 0 && consumo.quedan <= umbralConsumo) estado = 'por_agotar';
  else if (umbralVencimiento !== null) estado = 'por_vencer';
  else estado = 'vigente';

  return { estado, consumo, diasParaVencer, umbralVencimiento };
}

export interface AvisoRango {
  id: number;
  tipo: 'agotada' | 'por_agotar' | 'vencida' | 'por_vencer';
  documentType: string;
  prefijo: string;
  quedan: number;
  dias: number | null;
}

/**
 * Avisos de la banda superior, del más grave al más leve. Solo rangos activos
 * que exigen resolución o que se agotan (las notas también se agotan).
 */
export function avisosRangos(rangos: readonly RangoNumeracion[], hoy: string): AvisoRango[] {
  const peso: Record<AvisoRango['tipo'], number> = { agotada: 0, vencida: 1, por_agotar: 2, por_vencer: 3 };
  const salida: AvisoRango[] = [];
  for (const r of rangos) {
    if (!r.is_active) continue;
    const l = leerRango(r, hoy);
    const base = { id: r.id, documentType: r.document_type, prefijo: r.prefix ?? '', quedan: l.consumo.quedan, dias: l.diasParaVencer };
    if (l.estado === 'agotada' || l.estado === 'por_agotar' || l.estado === 'vencida' || l.estado === 'por_vencer') {
      salida.push({ ...base, tipo: l.estado });
    }
  }
  return salida.sort((a, b) => peso[a.tipo] - peso[b.tipo]);
}

/** Orden de la tabla: tipo (factura, soporte, NC, ND), sucursal, el más reciente primero. */
const ORDEN_TIPO: Record<string, number> = { invoice: 0, support_document: 1, credit_note: 2, debit_note: 3 };
export function ordenarRangos<T extends RangoNumeracion>(rangos: readonly T[]): T[] {
  return [...rangos].sort(
    (a, b) =>
      (ORDEN_TIPO[a.document_type] ?? 9) - (ORDEN_TIPO[b.document_type] ?? 9) ||
      Number(a.branch_id ?? 0) - Number(b.branch_id ?? 0) ||
      Number(b.is_active) - Number(a.is_active) ||
      b.id - a.id,
  );
}

// ── Formulario de edición ─────────────────────────────────────────────────────

export interface DatosRango {
  documentType: string;
  prefix: string;
  rangeStart: number;
  rangeEnd: number;
  currentNumber: number;
  resolutionNumber: string;
  resolutionDate: string;
  validFrom: string;
  validUntil: string;
  technicalKey: string;
  testSetId: string;
  factusNumberingRangeId: number | null;
  isActive: boolean;
  alertThreshold: number;
}

export type ErrorRango = 'prefijo' | 'rango' | 'actual' | 'vigencia' | 'tipo';

/** Mismas reglas que los CHECK de la tabla (`range_end >= range_start`, `current_number >= 0`) y unas de sentido común. */
export function validarRango(d: DatosRango): ErrorRango[] {
  const errores: ErrorRango[] = [];
  if (!['invoice', 'credit_note', 'debit_note', 'support_document'].includes(d.documentType)) errores.push('tipo');
  if (!d.prefix.trim() || d.prefix.trim().length > 10) errores.push('prefijo');
  if (!Number.isInteger(d.rangeStart) || !Number.isInteger(d.rangeEnd) || d.rangeStart < 0 || d.rangeEnd < d.rangeStart) errores.push('rango');
  if (!Number.isInteger(d.currentNumber) || d.currentNumber < 0 || (d.currentNumber > 0 && (d.currentNumber < d.rangeStart - 1 || d.currentNumber > d.rangeEnd)))
    errores.push('actual');
  if (d.validFrom && d.validUntil && d.validUntil < d.validFrom) errores.push('vigencia');
  return errores;
}
