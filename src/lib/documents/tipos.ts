/**
 * Motor único de documentos — modelo de datos.
 *
 * Un `DocumentoPayload` describe un documento imprimible YA RESUELTO en el
 * servidor desde la base (nunca con datos del body): emisor, sucursal,
 * contraparte, metadatos, líneas, tablas, totales, notas, firma y pie legal.
 * Los valores viajan CRUDOS (números, instantes ISO, fechas `YYYY-MM-DD`) y
 * los renderizadores los formatean con la moneda del documento y la zona
 * horaria de la organización (`formato.ts`). Los rótulos son CLAVES del
 * namespace `documentos` de next-intl (`messages/<idioma>.json`), nunca texto
 * cableado: el mismo payload sale en es/en/fr/pt.
 *
 * Este archivo no importa nada del servidor: lo usan también las funciones
 * cliente (`cliente.ts`) y los tests.
 */

import type { ContextoMoneda } from '@/lib/utils/moneda';

/** Tipos de documento que arma el motor. Es el segmento `[tipo]` de la ruta. */
export const TIPOS_DOCUMENTO = [
  'factura-venta',
  'nota-credito',
  'cotizacion',
  'factura-compra',
  'documento-soporte',
  'estado-cuenta',
  'estado-cuenta-proveedor',
  'recibo-caja',
  'comprobante-egreso',
  'cierre-caja',
  'arqueo-caja',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const FORMATOS_DOCUMENTO = ['pdf', 'html'] as const;
export type FormatoDocumento = (typeof FORMATOS_DOCUMENTO)[number];

export const PAPELES_DOCUMENTO = ['carta', 'a4', '80mm'] as const;
export type PapelDocumento = (typeof PAPELES_DOCUMENTO)[number];

/** Idiomas de los documentos: los mismos cuatro de la aplicación (`src/i18n/config.ts`). */
export const IDIOMAS_DOCUMENTO = ['es', 'en', 'fr', 'pt'] as const;
export type IdiomaDocumento = (typeof IDIOMAS_DOCUMENTO)[number];

/** Tipos que además de carta/A4 salen en rollo de 80 mm (comprobantes de caja). */
export const TIPOS_CON_80MM: ReadonlySet<TipoDocumento> = new Set<TipoDocumento>([
  'factura-venta',
  'recibo-caja',
  'comprobante-egreso',
  'cierre-caja',
  'arqueo-caja',
]);

export function esTipoDocumento(valor: unknown): valor is TipoDocumento {
  return typeof valor === 'string' && (TIPOS_DOCUMENTO as readonly string[]).includes(valor);
}
export function esFormatoDocumento(valor: unknown): valor is FormatoDocumento {
  return typeof valor === 'string' && (FORMATOS_DOCUMENTO as readonly string[]).includes(valor);
}
export function esPapelDocumento(valor: unknown): valor is PapelDocumento {
  return typeof valor === 'string' && (PAPELES_DOCUMENTO as readonly string[]).includes(valor);
}
export function esIdiomaDocumento(valor: unknown): valor is IdiomaDocumento {
  return typeof valor === 'string' && (IDIOMAS_DOCUMENTO as readonly string[]).includes(valor);
}

/** Tono visual de un estado (se traduce a colores del sistema de diseño). */
export type Tono = 'neutro' | 'marca' | 'exito' | 'aviso' | 'peligro' | 'info';

/**
 * Valor de un campo. El renderizador decide cómo se pinta:
 * - `texto`: texto del usuario o de la base (se escapa).
 * - `clave`: clave traducible del namespace `documentos` (p. ej. `formasPago.credito`).
 * - `dinero`: importe en la moneda del documento.
 * - `instante` / `instanteHora`: `timestamptz` → zona horaria de la organización.
 * - `fecha`: columna `date` (`YYYY-MM-DD`) → sin conversión de zona.
 * - `numero`: cantidad con decimales.
 * - `oculto`: importe que el usuario no puede ver (cierre ciego) → «***».
 */
export type Valor =
  | { tipo: 'texto'; v: string | null }
  | { tipo: 'clave'; v: string; vars?: Record<string, string | number> }
  | { tipo: 'dinero'; v: number | null }
  | { tipo: 'instante'; v: string | null }
  | { tipo: 'instanteHora'; v: string | null }
  | { tipo: 'fecha'; v: string | null }
  | { tipo: 'numero'; v: number | null; decimales?: number }
  | { tipo: 'oculto' };

/** Par rótulo/valor. `clave` vive en `documentos.campos`. */
export interface Campo {
  clave: string;
  valor: Valor;
}

export interface Emisor {
  nombre: string;
  razonSocial: string | null;
  nit: string | null;
  dv: string | null;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  responsabilidades: string[];
  actividadEconomica: string | null;
  /** Logo ya embebido (`data:image/...`), resuelto en el servidor. Nunca una URL remota. */
  logoDataUri: string | null;
  /** `organizations.primary_color` validado (hex de 6 dígitos) o null. */
  colorPrimario: string | null;
}

export interface SucursalDocumento {
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
}

export type RolContraparte = 'cliente' | 'proveedor' | 'responsable' | 'tercero';

export interface Contraparte {
  rol: RolContraparte;
  nombre: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  dv: string | null;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  responsabilidades: string[];
}

export interface ImpuestoLinea {
  /** Nombre real del impuesto (`tax_templates.name`, código o tributo DIAN). Nunca «IVA» cableado. */
  nombre: string | null;
  tasa: number | null;
  incluido: boolean;
}

export interface LineaDocumento {
  codigo: string | null;
  descripcion: string;
  nota: string | null;
  seriales: string[];
  cantidad: number;
  /**
   * Símbolo de la unidad de venta («kg», «lb», «m», «L») solo en productos por
   * peso o medida; `null` en productos por unidad (la columna dice «und»).
   */
  unidad?: string | null;
  /** Decimales de la cantidad del producto (3 en kg). */
  decimalesCantidad?: number | null;
  precioUnitario: number;
  descuento: number;
  impuesto: ImpuestoLinea | null;
  total: number;
}

export type TipoColumna = 'texto' | 'clave' | 'dinero' | 'instante' | 'instanteHora' | 'fecha' | 'numero';

export interface ColumnaTabla {
  /** Rótulo: clave de `documentos.columnas`. */
  clave: string;
  tipo: TipoColumna;
  alinear?: 'izquierda' | 'derecha' | 'centro';
}

/** Una celda: valor crudo del tipo de su columna, o `{ oculto: true }` (cierre ciego). */
export type CeldaTabla = string | number | null | { oculto: true };

export interface SeccionTabla {
  /** Título: clave de `documentos.secciones`. */
  titulo: string;
  columnas: ColumnaTabla[];
  filas: CeldaTabla[][];
  /** Fila de totales opcional (misma cantidad de celdas). */
  pie?: CeldaTabla[];
  /** Clave de `documentos.vacios` cuando no hay filas; sin ella, la sección se omite. */
  vacio?: string;
}

export type EstiloTotal = 'normal' | 'descuento' | 'total' | 'saldo' | 'pagado' | 'informativo';

export interface FilaTotal {
  /** Clave de `documentos.totales`. */
  clave: string;
  vars?: Record<string, string | number>;
  valor: number | null;
  estilo?: EstiloTotal;
  /** Importe que el usuario no puede ver (cierre ciego). */
  oculto?: boolean;
  /** Se pinta con signo menos (descuentos, pagos, retenciones). */
  resta?: boolean;
}

export interface ResolucionNumeracion {
  numero: string;
  fecha: string | null;
  prefijo: string | null;
  desde: number | null;
  hasta: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
}

export interface QrDocumento {
  /** Contenido del QR: la URL de verificación DIAN (con CUFE) o un resumen sin datos sensibles. */
  contenido: string;
  /** Clave de `documentos.qr` que explica qué es. */
  leyenda: string;
}

export interface PieLegal {
  /** Textos legales ya resueltos: configurables por organización o el de `messages/`. */
  textos: string[];
  resolucion: ResolucionNumeracion | null;
  /** CUFE / CUDE / CUDS del documento electrónico, si existe. */
  codigoUnico: { clave: 'cufe' | 'cude' | 'cuds'; valor: string } | null;
  qr: QrDocumento | null;
}

export type Firma = 'recibido' | 'aceptacion' | 'cajeroSupervisor' | 'entregaRecibe';

export type MarcaAgua = 'borrador' | 'anulada' | 'pagada';

/** Banda destacada bajo la cabecera (clave de `documentos.bandas`). */
export interface Banda {
  clave: string;
  vars?: Record<string, string | number>;
  tono: Tono;
}

export interface DocumentoPayload {
  tipo: TipoDocumento;
  /** Título: clave de `documentos.tipos` (p. ej. `factura-venta-electronica` cuando hay CUFE). */
  tituloClave: string;
  idioma: IdiomaDocumento;
  /** Número visible del documento (o null si es un borrador sin consecutivo). */
  numero: string | null;
  estado: { codigo: string; tono: Tono } | null;
  marcaAgua: MarcaAgua | null;
  bandas: Banda[];
  emisor: Emisor;
  sucursal: SucursalDocumento | null;
  contraparte: Contraparte | null;
  /** Caja de referencia (factura afectada de una nota crédito, sesión de un arqueo…). */
  referencia: Campo[];
  metadatos: Campo[];
  /** Tarjetas de resumen antes de las tablas (estado de cuenta, cierre de caja). */
  resumen: Campo[];
  lineas: LineaDocumento[] | null;
  secciones: SeccionTabla[];
  totales: FilaTotal[];
  notas: string | null;
  terminos: string | null;
  firma: Firma | null;
  /**
   * Quien firma y ya se conoce, pre-impreso sobre la raya de su casilla
   * (el cliente que entrega en un recibo de caja, el proveedor que recibe en
   * un comprobante de egreso). Opcional: sin él, la casilla va en blanco.
   */
  firmante?: { caja: 'entrega' | 'recibe'; parte: Contraparte } | null;
  pieLegal: PieLegal;
  /** Documento de un tercero (compra): paleta sobria en gris, no la marca. */
  sobrio: boolean;
  moneda: ContextoMoneda;
  zonaHoraria: string;
  /** Instante de generación (ISO). */
  generadoEn: string;
  /** Nombre de archivo sugerido, sin extensión y solo con caracteres seguros. */
  nombreArchivo: string;
}
