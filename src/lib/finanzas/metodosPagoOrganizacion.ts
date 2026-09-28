/**
 * Lo que una organización puede personalizar de un método de pago sin tocar el
 * catálogo GLOBAL `payment_methods` (GO-sec 2026-09-28, migración
 * 20260928173749_gosec_metodos_pago_catalogo_solo_plataforma).
 *
 * Vive en `organization_payment_methods.settings` de la propia organización:
 *   - `display_name`: nombre que ven sus cajeros y documentos;
 *   - `requires_reference`: si pide número de transacción.
 * El orden propio es `organization_payment_methods.website_display_order`.
 * Si la organización no los fijó, manda el catálogo global.
 */

export interface AjustesMetodoPago {
  display_name?: string | null;
  requires_reference?: boolean | null;
  [clave: string]: unknown;
}

function comoAjustes(settings: unknown): AjustesMetodoPago {
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as AjustesMetodoPago) : {};
}

/** Nombre visible: el propio de la organización, el del catálogo o el código. */
export function nombreVisibleMetodo(settings: unknown, nombreGlobal: string | null | undefined, codigo: string): string {
  const propio = comoAjustes(settings).display_name;
  if (typeof propio === 'string' && propio.trim() !== '') return propio.trim();
  return (nombreGlobal ?? '').trim() || codigo;
}

/** ¿Pide referencia? La decisión propia de la organización, si la tomó; si no, la del catálogo. */
export function requiereReferenciaMetodo(settings: unknown, requiereGlobal: boolean | null | undefined): boolean {
  const propio = comoAjustes(settings).requires_reference;
  return typeof propio === 'boolean' ? propio : !!requiereGlobal;
}

/**
 * Ordena como la organización ordenó sus métodos (`website_display_order`, el
 * mismo orden que arrastra en «Métodos de pago»); sin orden, al final y por código.
 */
export function ordenarMetodosDeLaOrganizacion<T extends { website_display_order?: number | null; payment_method_code: string }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => {
    const oa = typeof a.website_display_order === 'number' ? a.website_display_order : Number.MAX_SAFE_INTEGER;
    const ob = typeof b.website_display_order === 'number' ? b.website_display_order : Number.MAX_SAFE_INTEGER;
    return oa - ob || a.payment_method_code.localeCompare(b.payment_method_code);
  });
}

export type ClaveErrorMetodoPago = 'sinPermiso' | 'codigoInvalido' | 'codigoExiste' | 'nombreInvalido';

/** Traduce los errores de fn_metodo_pago_personalizado_crear / de RLS a una clave de `metodosPagoSeguridad`. */
export function claveErrorMetodoPago(error: unknown): ClaveErrorMetodoPago | null {
  const e = (error ?? {}) as { message?: unknown; code?: unknown };
  const mensaje = typeof e.message === 'string' ? e.message : '';
  if (mensaje.includes('sin_permiso') || e.code === '42501') return 'sinPermiso';
  if (mensaje.includes('codigo_invalido')) return 'codigoInvalido';
  if (mensaje.includes('codigo_existe')) return 'codigoExiste';
  if (mensaje.includes('nombre_invalido')) return 'nombreInvalido';
  return null;
}
