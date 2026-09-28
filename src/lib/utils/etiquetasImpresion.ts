/**
 * Etiquetas de producto para imprimir (papel, no los *tags* de clasificación).
 *
 * Plantillas del componente Figma `Doc/Etiqueta de producto` (sección
 * «Etiquetas de producto (Nuevo)», `511:257344`) y la aritmética que decide
 * cuántas etiquetas salen, en qué hoja y en qué casilla. Todo puro: lo usan
 * el diálogo (vista previa), la página de impresión y los tests.
 */

export type TipoPapel = 'hoja' | 'rollo';

export interface PlantillaEtiqueta {
  id: string;
  tipo: TipoPapel;
  /** Papel de la hoja; en rollo, la página ES la etiqueta. */
  papel: 'carta' | 'a4' | null;
  anchoMm: number;
  altoMm: number;
  columnas: number;
  filas: number;
  /** Márgenes de la hoja y separación entre etiquetas (mm). */
  margenSuperiorMm: number;
  margenIzquierdoMm: number;
  espacioXMm: number;
  espacioYMm: number;
}

const HOJA = {
  carta: { anchoMm: 215.9, altoMm: 279.4 },
  a4: { anchoMm: 210, altoMm: 297 },
} as const;

/**
 * Plantillas del diseño (carta 63,5 × 33,9 mm 3 × 8, A4 70 × 37 mm 3 × 8,
 * rollo 50 × 25 mm) más las hojas troqueladas y rollos más comunes.
 */
export const PLANTILLAS_ETIQUETA: readonly PlantillaEtiqueta[] = [
  { id: 'carta-3x8', tipo: 'hoja', papel: 'carta', anchoMm: 63.5, altoMm: 33.9, columnas: 3, filas: 8, margenSuperiorMm: 4.1, margenIzquierdoMm: 10.2, espacioXMm: 2.5, espacioYMm: 0 },
  { id: 'carta-3x10', tipo: 'hoja', papel: 'carta', anchoMm: 66.7, altoMm: 25.4, columnas: 3, filas: 10, margenSuperiorMm: 12.7, margenIzquierdoMm: 4.8, espacioXMm: 3.2, espacioYMm: 0 },
  { id: 'a4-3x8', tipo: 'hoja', papel: 'a4', anchoMm: 70, altoMm: 37, columnas: 3, filas: 8, margenSuperiorMm: 0.5, margenIzquierdoMm: 0, espacioXMm: 0, espacioYMm: 0 },
  { id: 'a4-3x7', tipo: 'hoja', papel: 'a4', anchoMm: 70, altoMm: 42.3, columnas: 3, filas: 7, margenSuperiorMm: 0.45, margenIzquierdoMm: 0, espacioXMm: 0, espacioYMm: 0 },
  { id: 'rollo-50x25', tipo: 'rollo', papel: null, anchoMm: 50, altoMm: 25, columnas: 1, filas: 1, margenSuperiorMm: 0, margenIzquierdoMm: 0, espacioXMm: 0, espacioYMm: 0 },
  { id: 'rollo-40x30', tipo: 'rollo', papel: null, anchoMm: 40, altoMm: 30, columnas: 1, filas: 1, margenSuperiorMm: 0, margenIzquierdoMm: 0, espacioXMm: 0, espacioYMm: 0 },
  { id: 'rollo-60x40', tipo: 'rollo', papel: null, anchoMm: 60, altoMm: 40, columnas: 1, filas: 1, margenSuperiorMm: 0, margenIzquierdoMm: 0, espacioXMm: 0, espacioYMm: 0 },
];

export const PLANTILLA_POR_DEFECTO = 'carta-3x8';

export function plantillaPorId(id: string | null | undefined): PlantillaEtiqueta {
  return PLANTILLAS_ETIQUETA.find((p) => p.id === id) ?? PLANTILLAS_ETIQUETA[0];
}

/** Tamaño de la página que se pide al navegador (`@page size`). */
export function tamanoPagina(p: PlantillaEtiqueta): { anchoMm: number; altoMm: number } {
  if (p.tipo === 'rollo' || !p.papel) return { anchoMm: p.anchoMm, altoMm: p.altoMm };
  return HOJA[p.papel];
}

export function etiquetasPorHoja(p: PlantillaEtiqueta): number {
  return Math.max(1, p.columnas * p.filas);
}

/** Qué se imprime en cada etiqueta. */
export interface CamposEtiqueta {
  nombre: boolean;
  variante: boolean;
  precio: boolean;
  precioComparacion: boolean;
  sku: boolean;
  codigo: boolean;
}

export const CAMPOS_POR_DEFECTO: CamposEtiqueta = {
  nombre: true,
  variante: true,
  precio: true,
  precioComparacion: false,
  sku: true,
  codigo: true,
};

/**
 * Una etiqueta lista para pintar: los importes ya vienen formateados con la
 * moneda de la organización (la página de impresión y la estación no saben
 * de monedas).
 */
export interface DatosEtiqueta {
  productId: number;
  nombre: string;
  variante: string | null;
  precio: string | null;
  precioComparacion: string | null;
  sku: string | null;
  codigo: string | null;
}

/** Tope por trabajo: una impresión de 5.000 etiquetas ya son 209 hojas carta. */
export const MAX_ETIQUETAS = 5000;

/**
 * Etiquetas «según el stock»: una por unidad en existencia. Sin inventario
 * (servicios, `track_stock = false`) → 1; stock negativo o fraccionario se
 * redondea hacia abajo y nunca baja de 0.
 */
export function cantidadSegunStock(stock: number | null | undefined, rastreaStock = true): number {
  if (!rastreaStock || stock === null || stock === undefined || !Number.isFinite(stock)) return 1;
  return Math.max(0, Math.floor(stock));
}

/** Normaliza una cantidad escrita a mano: entero entre 0 y el tope. */
export function normalizarCantidad(valor: number | string): number {
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_ETIQUETAS, Math.max(0, Math.floor(n)));
}

export function totalEtiquetas(cantidades: readonly number[]): number {
  return cantidades.reduce((s, c) => s + normalizarCantidad(c), 0);
}

/** Repite cada etiqueta tantas veces como su cantidad, en el orden de la lista. */
export function expandirEtiquetas<T>(items: readonly { dato: T; cantidad: number }[]): T[] {
  const salida: T[] = [];
  for (const it of items) {
    const n = normalizarCantidad(it.cantidad);
    for (let i = 0; i < n && salida.length < MAX_ETIQUETAS; i++) salida.push(it.dato);
  }
  return salida;
}

/**
 * Casilla de inicio válida (1-based) para una hoja ya empezada. En rollo no
 * aplica: siempre 1.
 */
export function normalizarInicio(p: PlantillaEtiqueta, inicio: number): number {
  if (p.tipo === 'rollo') return 1;
  const n = Math.floor(Number(inicio));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, etiquetasPorHoja(p));
}

/**
 * Reparte las etiquetas en páginas. En hoja, las primeras `inicio − 1`
 * casillas de la primera quedan vacías (`null`: la hoja ya está empezada) y
 * la última se completa con `null`. En rollo, una etiqueta por página.
 */
export function distribuirEnPaginas<T>(etiquetas: readonly T[], p: PlantillaEtiqueta, inicio = 1): (T | null)[][] {
  if (etiquetas.length === 0) return [];
  if (p.tipo === 'rollo') return etiquetas.map((e) => [e]);
  const porHoja = etiquetasPorHoja(p);
  const celdas: (T | null)[] = [...Array<null>(normalizarInicio(p, inicio) - 1).fill(null), ...etiquetas];
  const paginas: (T | null)[][] = [];
  for (let i = 0; i < celdas.length; i += porHoja) {
    const pagina = celdas.slice(i, i + porHoja);
    while (pagina.length < porHoja) pagina.push(null);
    paginas.push(pagina);
  }
  return paginas;
}

/** Hojas (o etiquetas de rollo) que ocupará el trabajo. */
export function contarPaginas(total: number, p: PlantillaEtiqueta, inicio = 1): number {
  if (total <= 0) return 0;
  if (p.tipo === 'rollo') return total;
  return Math.ceil((total + normalizarInicio(p, inicio) - 1) / etiquetasPorHoja(p));
}

/** Posición (mm) de la casilla `indice` (0-based) dentro de su hoja. */
export function posicionCasilla(p: PlantillaEtiqueta, indice: number): { xMm: number; yMm: number } {
  const col = indice % p.columnas;
  const fila = Math.floor(indice / p.columnas) % p.filas;
  return {
    xMm: p.margenIzquierdoMm + col * (p.anchoMm + p.espacioXMm),
    yMm: p.margenSuperiorMm + fila * (p.altoMm + p.espacioYMm),
  };
}

/** «Talla: 42 · Color: Negro» a partir de `products.variant_data`. */
export function textoVariante(variantData: unknown): string | null {
  if (!variantData || typeof variantData !== 'object' || Array.isArray(variantData)) return null;
  const partes = Object.entries(variantData as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)} ${String(v)}`);
  return partes.length ? partes.join(' · ') : null;
}

/** Trabajo que el diálogo deja a la página de impresión. */
export interface TrabajoImpresionEtiquetas {
  version: 1;
  plantillaId: string;
  inicio: number;
  campos: CamposEtiqueta;
  etiquetas: DatosEtiqueta[];
  /** Abrir el diálogo de impresión del navegador en cuanto esté pintado. */
  imprimirAlAbrir: boolean;
  creadoEn: number;
}

/** Clave de almacenamiento local del trabajo (la página lo lee y lo borra). */
export const CLAVE_TRABAJO_ETIQUETAS = 'go-admin:etiquetas-imprimir:';

export function esTrabajoValido(x: unknown): x is TrabajoImpresionEtiquetas {
  if (!x || typeof x !== 'object') return false;
  const t = x as Partial<TrabajoImpresionEtiquetas>;
  return t.version === 1 && typeof t.plantillaId === 'string' && Array.isArray(t.etiquetas) && !!t.campos;
}
