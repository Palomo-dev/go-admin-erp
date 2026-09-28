/**
 * CSV que produce el importador: plantilla descargable y reporte de errores.
 * Con BOM para que Excel en Windows abra las tildes bien.
 */

import { CAMPOS } from './campos';

export function escaparCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const s = String(valor);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function aCsv(filas: unknown[][]): string {
  return filas.map((f) => f.map(escaparCsv).join(',')).join('\n');
}

export const BOM = '\uFEFF';

/** Cabeceras de la plantilla, en el orden de siempre (26 columnas). */
export const CABECERAS_PLANTILLA = CAMPOS.map((c) => c.cabecera);

/**
 * Ejemplos de la plantilla. Mismo contenido que la anterior, con la estación
 * corregida (`hot_kitchen`: la base no acepta «kitchen») y precios sin
 * decimales, como se escriben en pesos.
 */
export const EJEMPLOS_PLANTILLA: string[][] = [
  ['PROD-001', 'Camiseta Polo', 'Producto', 'Camiseta de algodón premium', 'Ropa', 'UN', '7501234567890', 'Nike', 'REF-001', 'Distribuidor SA', '100000', '150000', '50000', 'IVA 19%', 'true', '0', '5', 'nuevo;oferta', 'Producto de temporada', '', '', '', 'true', 'none', '', 'active'],
  ['PROD-001-AZUL-M', 'Camiseta Polo Azul M', 'Producto', '', 'Ropa', 'UN', '', 'Nike', 'REF-001', '', '120000', '', '60000', 'IVA 19%', 'true', '50', '5', '', '', '', 'PROD-001', '{"color":"azul","talla":"M"}', 'false', 'none', '', 'active'],
  ['PROD-001-ROJO-L', 'Camiseta Polo Rojo L', 'Producto', '', 'Ropa', 'UN', '', 'Nike', 'REF-001', '', '120000', '', '60000', 'IVA 19%', 'true', '30', '5', '', '', '', 'PROD-001', 'color:rojo,talla:L', 'false', 'none', '', 'active'],
  ['SERV-001', 'Instalación Profesional', 'Servicio', 'Servicio de instalación a domicilio', '', 'SV', '', '', '', '', '80000', '', '', 'IVA 19%', 'false', '0', '0', '', '', '', '', '', 'false', 'none', '', 'active'],
  ['PROD-002', 'Café Premium 500g', 'Producto', 'Café 100% arábica', 'Bebidas', 'GR', '7701234567890', 'Café del Valle', 'CAFE-500', 'Distribuidor Café', '35000', '45000', '20000', 'IVA 5%', 'true', '100', '10', 'orgánico;premium', 'Café de origen', 'https://ejemplo.com/cafe1.jpg;https://ejemplo.com/cafe2.jpg', '', '', 'false', 'hot_kitchen', 'Tamaños|single|1|1|true|Pequeño=0,Mediano=5000,Grande=10000; Leche|multiple|0|2|false|Entera=0,Deslactosada=0,Almendras=1000', 'active'],
];

/**
 * Plantilla descargable. `cabeceras` = las del idioma de la interfaz
 * (`productosImportar.cabeceras`); el importador las reconoce en es/en/fr/pt.
 * Las filas de ejemplo son datos de muestra y no se traducen.
 */
export function plantillaCsv(cabeceras: readonly string[] = CABECERAS_PLANTILLA): string {
  return BOM + aCsv([[...cabeceras], ...EJEMPLOS_PLANTILLA]);
}

export interface FilaReporte {
  fila: number;
  sku: string;
  nombre: string;
  resultado: string;
  mensajes: string[];
}

/** Reporte descargable: una línea por fila con problema (error, aviso u omitida). */
export function reporteCsv(filas: FilaReporte[], cabeceras: [string, string, string, string, string]): string {
  return BOM + aCsv([cabeceras, ...filas.map((f) => [f.fila, f.sku, f.nombre, f.resultado, f.mensajes.join(' | ')])]);
}
