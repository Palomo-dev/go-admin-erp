/**
 * Diferencia de campos de una fila de `products_audit_log` (tipo
 * `auditoria` del historial). El disparador guarda la fila completa en
 * `changes.before` / `changes.after` (los registros viejos usan `old` /
 * `new`); aquí se calcula qué campos cambiaron, ignorando los técnicos.
 * Puro: la interfaz traduce la etiqueta y formatea los valores.
 */

/** Campos con etiqueta traducida (`productoDetalle.historial.campos.*`). */
export const CAMPOS_CONOCIDOS = [
  'name',
  'sku',
  'barcode',
  'status',
  'category_id',
  'description',
  'brand',
  'reference',
  'track_stock',
  'track_serial',
  'warranty_months',
  'serial_pattern',
  'auto_generate_serial',
  'product_type',
  'unit_code',
  'station',
  'weight_kg',
  'length_cm',
  'width_cm',
  'height_cm',
  'is_parent',
] as const;

export type CampoConocido = (typeof CAMPOS_CONOCIDOS)[number];

const IGNORADOS = new Set(['id', 'uuid', 'organization_id', 'created_at', 'updated_at', 'rating_avg', 'reviews_count']);

export interface CambioCampo {
  campo: string;
  antes: unknown;
  despues: unknown;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function iguales(a: unknown, b: unknown): boolean {
  const vacio = (v: unknown) => v === null || v === undefined || v === '';
  if (vacio(a) && vacio(b)) return true;
  if ((typeof a === 'number' || typeof a === 'string') && (typeof b === 'number' || typeof b === 'string')) {
    const na = Number(a);
    const nb = Number(b);
    if (String(a).trim() !== '' && String(b).trim() !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function ignorado(campo: string): boolean {
  return IGNORADOS.has(campo) || campo.startsWith('busqueda_');
}

/** Antes y después de un registro de auditoría (formato nuevo o viejo). */
export function extremosAuditoria(cambios: unknown): { antes: Record<string, unknown> | null; despues: Record<string, unknown> | null } {
  if (!esObjeto(cambios)) return { antes: null, despues: null };
  const antes = cambios.before ?? cambios.old;
  const despues = cambios.after ?? cambios.new;
  return { antes: esObjeto(antes) ? antes : null, despues: esObjeto(despues) ? despues : null };
}

/** Campos que cambiaron (conocidos primero, en el orden de CAMPOS_CONOCIDOS). */
export function cambiosAuditoria(cambios: unknown): CambioCampo[] {
  const { antes, despues } = extremosAuditoria(cambios);
  if (!antes || !despues) return [];
  const claves = Array.from(new Set([...Object.keys(antes), ...Object.keys(despues)])).filter((c) => !ignorado(c));
  const orden = (c: string) => {
    const i = (CAMPOS_CONOCIDOS as readonly string[]).indexOf(c);
    return i === -1 ? CAMPOS_CONOCIDOS.length : i;
  };
  return claves
    .filter((c) => !iguales(antes[c], despues[c]))
    .sort((a, b) => orden(a) - orden(b) || a.localeCompare(b))
    .map((campo) => ({ campo, antes: antes[campo], despues: despues[campo] }));
}

export function esCampoConocido(campo: string): campo is CampoConocido {
  return (CAMPOS_CONOCIDOS as readonly string[]).includes(campo);
}
