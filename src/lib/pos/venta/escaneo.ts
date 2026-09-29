/**
 * Un código leído (lector USB, cámara o escrito + Enter) → qué hacer con él.
 * Lo comparten el POS (`ProductSearch`) y «Agregar productos» de la mesa, para
 * que el mismo código haga lo mismo en las dos pantallas
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.7 y §10):
 *
 * 1. El código EXACTO manda (`porCodigo`): el generador interno usa el
 *    prefijo 20 y las etiquetas de balanza también empiezan por 20–29. Si la
 *    fila exacta existe pero su producto no vino en la primera página buscada
 *    con el código, se busca en una página más amplia.
 * 2. Sin código exacto, ¿es una etiqueta de peso variable de la organización?
 *    (`decodificarEtiquetaPeso` → PLU → `lineaDesdeEtiqueta`): la línea sale
 *    con su peso y `notes.pesaje` de origen «etiqueta», sin abrir «Pesar».
 * 3. Si no, la decisión de siempre (`resolverCodigo`): variante exacta directo,
 *    padre con variantes o modificadores → diálogo, simple → como la tarjeta
 *    (un producto por peso abre «Pesar»; con báscula estable, el flujo de un
 *    paso de la báscula).
 *
 * Sin React ni Supabase: las lecturas se inyectan (`DependenciasEscaneo`) y
 * los avisos los pinta cada pantalla con sus textos.
 */

import type { Product } from '@/components/pos/types';
import {
  decodificarEtiquetaPeso,
  lineaDesdeEtiqueta,
  type EtiquetaPeso,
  type FormatoEtiquetaPeso,
  type LineaEtiqueta,
  type MotivoEtiquetaInvalida,
} from '@/lib/pos/etiquetaPeso';
import { resolverCodigo, type DecisionEscaneo, type PosGridProduct } from './catalogo';

export interface DependenciasEscaneo {
  /** Fila exacta por `products.barcode` (puede ser una variante), o null. */
  porCodigo: (codigo: string) => Promise<Product | null>;
  /** Página del catálogo buscada con un término (trae padre/simple con stock, variantes y modificadores). */
  grilla: (termino: string, limite: number) => Promise<PosGridProduct[]>;
  /** Producto por PLU de balanza. Sin él no se leen etiquetas de peso. */
  porPlu?: (plu: number) => Promise<Product | null>;
  /** Precio vigente por unidad de venta (etiquetas con precio embebido). */
  precioVigente?: (producto: Product) => Promise<number | null>;
  formatoEtiqueta: FormatoEtiquetaPeso | null | undefined;
  decimalesMoneda: number;
}

export type ResultadoEscaneo =
  | { tipo: 'producto'; decision: DecisionEscaneo }
  | { tipo: 'etiqueta_invalida'; motivo: MotivoEtiquetaInvalida }
  | { tipo: 'etiqueta'; etiqueta: EtiquetaPeso; producto: Product | null; linea: LineaEtiqueta };

/** Página inicial y amplia del catálogo buscada con el código (las mismas del POS). */
export const LIMITE_GRILLA_CODIGO = 5;
export const LIMITE_GRILLA_CODIGO_AMPLIA = 100;

export async function resolverEscaneo(codigo: string, d: DependenciasEscaneo): Promise<ResultadoEscaneo> {
  const [row, pagina] = await Promise.all([d.porCodigo(codigo).catch(() => null), d.grilla(codigo, LIMITE_GRILLA_CODIGO)]);
  let grilla = pagina;
  const idExacto = row ? (row.parent_product_id ?? row.id) : null;
  if (idExacto !== null && !grilla.some((p) => p.id === idExacto)) {
    grilla = await d.grilla(codigo, LIMITE_GRILLA_CODIGO_AMPLIA);
  }

  if (!row && d.porPlu) {
    const leida = decodificarEtiquetaPeso(codigo, d.formatoEtiqueta ?? null);
    if (leida.tipo === 'invalida') return { tipo: 'etiqueta_invalida', motivo: leida.motivo };
    if (leida.tipo !== 'no_es_etiqueta') {
      const { etiqueta } = leida;
      const fila = await d.porPlu(etiqueta.plu);
      let producto: Product | null = fila;
      if (fila) {
        // La misma forma que la tarjeta (precio, categoría, estación); si no aparece, la fila tal cual.
        const porNombre = await d.grilla(fila.sku || fila.name, 20).catch(() => [] as PosGridProduct[]);
        producto = porNombre.find((p) => p.id === fila.id) ?? fila;
      }
      const precio =
        producto && etiqueta.contenido === 'price' && d.precioVigente ? await d.precioVigente(producto).catch(() => null) : null;
      const linea = lineaDesdeEtiqueta({ etiqueta, producto, precioPorUnidad: precio, decimalesMoneda: d.decimalesMoneda });
      return { tipo: 'etiqueta', etiqueta, producto, linea };
    }
  }

  return { tipo: 'producto', decision: resolverCodigo(row, grilla) };
}

/**
 * ¿El texto del buscador es un código de barras? Solo dígitos, de 6 a 14
 * (EAN-8, UPC-A, EAN-13, ITF-14 y los internos): con Enter se resuelve como
 * un escaneo y el producto va directo al carrito. Un nombre o un SKU con
 * letras sigue siendo una búsqueda. «3*…» (cantidad rápida) no es un código.
 */
export function pareceCodigoDeBarras(texto: string | null | undefined): boolean {
  return /^\d{6,14}$/.test((texto ?? '').trim());
}
