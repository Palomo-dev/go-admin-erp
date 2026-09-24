/**
 * Seriales: patrón de generación, estados, transiciones manuales y garantía.
 *
 * La generación real ocurre en el servidor (`fn_producto_generar_seriales`);
 * aquí solo se previsualiza con el mismo orden de reemplazo, para que la vista
 * previa del formulario y del diálogo coincida con lo que se guarda.
 * Las transiciones reflejan las de `fn_producto_serial_cambiar_estado`.
 */

/** Tokens del patrón (un solo vocabulario: formulario, detalle y servidor). */
export const TOKENS_PATRON = ['{PROD}', '{YYYY}', '{YY}', '{MM}', '{DD}', '{SEQ}', '{####}', '{###}', '{##}'] as const;
export type TokenPatron = (typeof TOKENS_PATRON)[number];

const CONSECUTIVOS: readonly TokenPatron[] = ['{SEQ}', '{####}', '{###}', '{##}'];

export function patronTieneConsecutivo(patron: string | null | undefined): boolean {
  return !!patron && CONSECUTIVOS.some((t) => patron.includes(t));
}

export type ErrorPatron = 'patron_requerido' | 'patron_sin_consecutivo';

export function validarPatron(patron: string | null | undefined): ErrorPatron | null {
  if (!patron || !patron.trim()) return 'patron_requerido';
  if (!patronTieneConsecutivo(patron)) return 'patron_sin_consecutivo';
  return null;
}

/**
 * Serial que produciría el patrón. `fecha` es el día de la organización
 * (YYYY-MM-DD, de `useFormatDate().getToday()`), nunca `toISOString()`.
 */
export function previsualizarSerial(
  patron: string,
  datos: { sku: string; fecha: string; secuencia: number },
): string {
  const [yyyy = '', mm = '', dd = ''] = datos.fecha.split('-');
  const seq = Math.max(1, Math.floor(datos.secuencia));
  return patron
    .split('{PROD}').join(datos.sku)
    .split('{YYYY}').join(yyyy)
    .split('{YY}').join(yyyy.slice(2))
    .split('{MM}').join(mm)
    .split('{DD}').join(dd)
    .split('{SEQ}').join(String(seq).padStart(6, '0'))
    .split('{####}').join(String(seq).padStart(4, '0'))
    .split('{###}').join(String(seq).padStart(3, '0'))
    .split('{##}').join(String(seq).padStart(2, '0'));
}

/** Inserta un token en el patrón en la posición del cursor (constructor por chips). */
export function insertarToken(patron: string, token: TokenPatron, posicion?: number): { patron: string; cursor: number } {
  const pos = posicion === undefined ? patron.length : Math.max(0, Math.min(posicion, patron.length));
  const nuevo = patron.slice(0, pos) + token + patron.slice(pos);
  return { patron: nuevo, cursor: pos + token.length };
}

// ── Estados ────────────────────────────────────────────────────────────────

export type EstadoSerial =
  | 'in_stock'
  | 'reserved'
  | 'sold'
  | 'returned'
  | 'in_transit'
  | 'damaged'
  | 'rma'
  | 'warranty_claim'
  | 'warranty'
  | 'repair'
  | 'defective';

/** Los 8 estados que se filtran en la pestaña (los 3 heredados se muestran, no se filtran). */
export const ESTADOS_SERIAL_FILTRO: readonly EstadoSerial[] = [
  'in_stock',
  'reserved',
  'sold',
  'returned',
  'in_transit',
  'damaged',
  'rma',
  'warranty_claim',
];

export type TonoSerial = 'exito' | 'informacion' | 'marca' | 'advertencia' | 'peligro' | 'neutro';

export const TONO_ESTADO_SERIAL: Record<EstadoSerial, TonoSerial> = {
  in_stock: 'exito',
  reserved: 'informacion',
  sold: 'marca',
  returned: 'advertencia',
  in_transit: 'informacion',
  damaged: 'peligro',
  rma: 'advertencia',
  warranty_claim: 'peligro',
  warranty: 'advertencia',
  repair: 'advertencia',
  defective: 'peligro',
};

/** Estados manuales a los que se puede pasar desde cada estado. */
export const TRANSICIONES_SERIAL: Readonly<Partial<Record<EstadoSerial, readonly EstadoSerial[]>>> = {
  in_stock: ['damaged', 'rma'],
  reserved: ['in_stock'],
  damaged: ['in_stock', 'rma'],
  rma: ['in_stock', 'damaged'],
  returned: ['in_stock', 'damaged', 'rma'],
  in_transit: ['in_stock'],
  sold: ['returned'],
  warranty_claim: ['sold', 'returned'],
};

export function transicionesSerial(estado: string): readonly EstadoSerial[] {
  return TRANSICIONES_SERIAL[estado as EstadoSerial] ?? [];
}

/** Estados destino comunes a toda una selección (acción masiva). */
export function transicionesComunes(estados: readonly string[]): EstadoSerial[] {
  if (estados.length === 0) return [];
  const [primero, ...resto] = estados.map((e) => new Set(transicionesSerial(e)));
  return [...primero].filter((e) => resto.every((s) => s.has(e)));
}

/** Seriales que aún se pueden generar en una sucursal (stock − seriales en stock o reservados). */
export function cupoSeriales(stockSucursal: number, serialesDisponibles: number): number {
  return Math.max(Math.floor(stockSucursal) - serialesDisponibles, 0);
}

/** Lista pegada o escaneada: una por línea, coma, punto y coma o tabulador; sin repetidos. */
export function parsearListaSeriales(texto: string): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const parte of texto.split(/[\n\r,;\t]+/)) {
    const s = parte.trim();
    if (!s || vistos.has(s)) continue;
    vistos.add(s);
    salida.push(s);
  }
  return salida;
}

// ── Garantía ───────────────────────────────────────────────────────────────

export type EstadoGarantia = 'vigente' | 'vencida' | 'sin_garantia';

/** Días entre dos fechas planas YYYY-MM-DD (sin zona horaria). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** `warrantyEnd` es una columna `date`; `hoy` el día de la organización. */
export function estadoGarantia(warrantyEnd: string | null | undefined, hoy: string): { estado: EstadoGarantia; dias: number } {
  if (!warrantyEnd) return { estado: 'sin_garantia', dias: 0 };
  const dias = diasEntre(hoy, warrantyEnd.slice(0, 10));
  return dias >= 0 ? { estado: 'vigente', dias } : { estado: 'vencida', dias: -dias };
}
