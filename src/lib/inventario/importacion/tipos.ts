/**
 * Tipos del asistente de importación de productos (archivo y web).
 * Los mensajes viajan como código + parámetros: la UI los traduce con
 * next-intl (`productosImportar.mensajes.<codigo>`), así que ningún texto
 * visible sale de la lógica.
 */

/** Una fila ya leída del archivo o de la web, antes de validar. */
export interface FilaImport {
  /** Número de fila en el archivo (1 = primera fila de la hoja). En la web, posición del producto. */
  fila: number;
  sku?: string;
  name?: string;
  type?: string;
  description?: string;
  category?: string;
  unit?: string;
  barcode?: string;
  brand?: string;
  reference?: string;
  /** Uno o varios, separados por «;». */
  supplier?: string;
  price?: number;
  comparePrice?: number;
  cost?: number;
  tax?: string;
  trackStock?: boolean;
  stock?: number;
  minLevel?: number;
  /** Separadas por «;». */
  tags?: string;
  notes?: string;
  /** Separadas por «;», coma o salto de línea. */
  imageUrls?: string;
  parentSku?: string;
  /** JSON (`{"color":"azul"}`) o «color:azul,talla:M». */
  variantData?: string;
  isParent?: boolean;
  station?: string;
  /** «Grupo|modo|min|max|requerido|op1=precio,op2=precio; Grupo2|…». */
  modifiers?: string;
  status?: string;
  /** Avisos que dejó la lectura (formatos especiales). */
  avisosLectura?: Mensaje[];
  /** El SKU lo inventó el lector (formatos sin SKU o web). */
  skuGenerado?: boolean;
  /** Variante creada desde la web: hereda las imágenes del padre al importar. */
  imagenesDelPadre?: boolean;
}

export type CodigoMensaje =
  // errores
  | 'sinNombre'
  | 'sinSku'
  | 'skuDuplicadoArchivo'
  | 'precioInvalido'
  | 'costoInvalido'
  | 'stockInvalido'
  | 'stockSinCosto'
  | 'padreNoEncontrado'
  | 'nombreMuyLargo'
  // avisos
  | 'skuGenerado'
  | 'costoMayorPrecio'
  | 'costoPrecioIntercambiados'
  | 'promoEnNotas'
  | 'unidadDesconocida'
  | 'estacionDesconocida'
  | 'impuestoNoEncontrado'
  | 'variantesSinFormato'
  | 'urlImagenInvalida'
  | 'categoriaNueva'
  | 'existeOmitido'
  | 'noExisteOmitido'
  | 'skuRenombrado'
  | 'stockIgnoradoExistente'
  | 'comparacionMenorPrecio'
  | 'coincidePorNombre'
  | 'estadoDesconocido'
  | 'modificadoresSinFormato';

export interface Mensaje {
  codigo: CodigoMensaje;
  params?: Record<string, string | number>;
}

export type ModoImportacion = 'crear_y_actualizar' | 'solo_crear' | 'solo_actualizar' | 'duplicar';
export type StockExistentes = 'ignorar' | 'sumar';

export interface OpcionesImportacion {
  modo: ModoImportacion;
  stockExistentes: StockExistentes;
  importarImagenes: boolean;
  /** Filas sin SKU reciben uno generado (si no, es error). */
  generarSku: boolean;
}

export const OPCIONES_POR_DEFECTO: OpcionesImportacion = {
  modo: 'crear_y_actualizar',
  stockExistentes: 'ignorar',
  importarImagenes: true,
  generarSku: true,
};

export type EstadoFila = 'listo' | 'aviso' | 'error';
export type AccionFila = 'crear' | 'actualizar' | 'omitir';

export interface FilaValidada {
  /** Clave estable para la tabla (el número de fila). */
  id: string;
  datos: FilaImport;
  estado: EstadoFila;
  accion: AccionFila;
  errores: Mensaje[];
  avisos: Mensaje[];
  /** Producto existente con el que coincide. */
  productoId?: number;
}

/** Resultado por fila que devuelve la importación en servidor. */
export interface ResultadoFila {
  fila: number;
  sku: string;
  ok: boolean;
  accion?: 'creado' | 'actualizado' | 'omitido';
  productId?: number;
  error?: string;
  /** Avisos del servidor (códigos de la RPC y de las imágenes). */
  avisos?: { codigo: string; detalle?: string }[];
}
