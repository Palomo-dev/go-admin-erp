/**
 * Campos del importador de productos y reconocimiento de columnas.
 *
 * Las cabeceras de la plantilla son las mismas que usaba el importador
 * anterior (26 columnas), así que un archivo exportado desde GO Admin o
 * descargado como plantilla antes del rediseño se sigue leyendo igual. Los
 * alias cubren Siigo, listados caseros y cabeceras en inglés.
 */

import { normalizarCabecera } from './texto';

export type CampoProducto =
  | 'sku'
  | 'name'
  | 'type'
  | 'description'
  | 'category'
  | 'unit'
  | 'barcode'
  | 'brand'
  | 'reference'
  | 'supplier'
  | 'price'
  | 'comparePrice'
  | 'cost'
  | 'tax'
  | 'trackStock'
  | 'stock'
  | 'minLevel'
  | 'tags'
  | 'notes'
  | 'imageUrls'
  | 'parentSku'
  | 'variantData'
  | 'isParent'
  | 'station'
  | 'modifiers'
  | 'status';

export type TipoCampo = 'texto' | 'numero' | 'booleano';

export interface DefinicionCampo {
  campo: CampoProducto;
  /** Cabecera de la plantilla (y de la exportación). */
  cabecera: string;
  tipo: TipoCampo;
  obligatorio?: boolean;
  /** Alias ya normalizados con `normalizarCabecera`. */
  alias: string[];
}

export const CAMPOS: DefinicionCampo[] = [
  { campo: 'sku', cabecera: 'SKU', tipo: 'texto', alias: ['sku', 'codigo', 'code', 'cod', 'codigoproducto', 'codigointerno', 'plu', 'clave', 'productcode'] },
  { campo: 'name', cabecera: 'Nombre', tipo: 'texto', obligatorio: true, alias: ['nombre', 'name', 'producto', 'articulo', 'item', 'nombreproducto', 'nombredelproducto', 'title', 'titulo', 'productname', 'nom', 'nome'] },
  { campo: 'type', cabecera: 'Tipo', tipo: 'texto', alias: ['tipo', 'type', 'tipodeproducto', 'producttype'] },
  { campo: 'description', cabecera: 'Descripción', tipo: 'texto', alias: ['descripcion', 'description', 'descripcionlarga', 'detalle', 'detalles', 'descricao'] },
  { campo: 'category', cabecera: 'Categoría', tipo: 'texto', alias: ['categoria', 'category', 'categorias', 'linea', 'familia', 'grupo', 'categorie'] },
  { campo: 'unit', cabecera: 'Unidad', tipo: 'texto', alias: ['unidad', 'unit', 'unidaddemedida', 'um', 'medida', 'unite', 'unidade'] },
  { campo: 'barcode', cabecera: 'Código de Barras', tipo: 'texto', alias: ['codigodebarras', 'codigobarras', 'barcode', 'ean', 'upc', 'gtin', 'codbarras', 'barras', 'codigodebarra'] },
  { campo: 'brand', cabecera: 'Marca', tipo: 'texto', alias: ['marca', 'brand', 'fabricante', 'marque'] },
  { campo: 'reference', cabecera: 'Referencia', tipo: 'texto', alias: ['referencia', 'reference', 'ref', 'referencie'] },
  { campo: 'supplier', cabecera: 'Proveedor', tipo: 'texto', alias: ['proveedor', 'supplier', 'proveedorprincipal', 'proveedores', 'vendor', 'fornecedor', 'fournisseur'] },
  { campo: 'price', cabecera: 'Precio de Venta', tipo: 'numero', alias: ['preciodeventa', 'precio', 'precios', 'price', 'precioventa', 'pventa', 'pvp', 'valorventa', 'preciounitario', 'precioalpublico', 'saleprice', 'prix', 'preco'] },
  { campo: 'comparePrice', cabecera: 'Precio de Comparación', tipo: 'numero', alias: ['preciodecomparacion', 'preciocomparacion', 'compareprice', 'compareatprice', 'precioanterior', 'precioantes', 'precioregular', 'regularprice'] },
  { campo: 'cost', cabecera: 'Costo', tipo: 'numero', alias: ['costo', 'cost', 'costodeadquisicion', 'preciocosto', 'preciocompra', 'costounitario', 'valorcompra', 'custo', 'cout'] },
  { campo: 'tax', cabecera: 'Impuesto', tipo: 'texto', alias: ['impuesto', 'impuestos', 'tax', 'iva', 'taxes', 'imposto'] },
  { campo: 'trackStock', cabecera: 'Rastrear Inventario', tipo: 'booleano', alias: ['rastrearinventario', 'trackstock', 'rastrearstock', 'controlainventario', 'inventariable', 'trackinventory'] },
  { campo: 'stock', cabecera: 'Stock Total', tipo: 'numero', alias: ['stocktotal', 'stock', 'cantidad', 'existencias', 'inventario', 'qty', 'quantity', 'unidades', 'saldo', 'quantidade', 'quantite'] },
  { campo: 'minLevel', cabecera: 'Stock Mínimo', tipo: 'numero', alias: ['stockminimo', 'minlevel', 'minimo', 'nivelminimo', 'minstock', 'estoqueminimo'] },
  { campo: 'tags', cabecera: 'Etiquetas', tipo: 'texto', alias: ['etiquetas', 'etiqueta', 'tags', 'tag'] },
  { campo: 'notes', cabecera: 'Notas', tipo: 'texto', alias: ['notas', 'nota', 'notes', 'observaciones', 'observacion'] },
  { campo: 'imageUrls', cabecera: 'URLs de Imágenes', tipo: 'texto', alias: ['urlsdeimagenes', 'urldeimagenes', 'urlsimagenes', 'imagenes', 'images', 'imagen', 'image', 'imageurl', 'imageurls', 'fotos', 'foto', 'imagelink'] },
  { campo: 'parentSku', cabecera: 'SKU Padre', tipo: 'texto', alias: ['skupadre', 'parentsku', 'codigopadre', 'skudelpadre'] },
  { campo: 'variantData', cabecera: 'Datos de Variante', tipo: 'texto', alias: ['datosdevariante', 'variantdata', 'variante', 'atributos', 'attributes'] },
  { campo: 'isParent', cabecera: 'Es Producto Padre', tipo: 'booleano', alias: ['esproductopadre', 'isparent', 'espadre'] },
  { campo: 'station', cabecera: 'Estación', tipo: 'texto', alias: ['estacion', 'station'] },
  { campo: 'modifiers', cabecera: 'Modificadores', tipo: 'texto', alias: ['modificadores', 'modifiers', 'modificador'] },
  { campo: 'status', cabecera: 'Estado', tipo: 'texto', alias: ['estado', 'status', 'state', 'statut'] },
];

export const CAMPO_POR_ID: Record<CampoProducto, DefinicionCampo> = Object.fromEntries(
  CAMPOS.map((c) => [c.campo, c]),
) as Record<CampoProducto, DefinicionCampo>;

/** Asignación columna del archivo → campo (o `null` = «No importar»). */
export type Mapeo = Array<CampoProducto | null>;

/**
 * Reconoce las cabeceras de una fila. Cada campo se asigna a la primera
 * columna que lo nombra; las repeticiones quedan sin importar.
 */
export function autoMapear(cabeceras: unknown[]): Mapeo {
  const usados = new Set<CampoProducto>();
  return cabeceras.map((h) => {
    const norm = normalizarCabecera(h);
    if (!norm) return null;
    for (const def of CAMPOS) {
      if (usados.has(def.campo)) continue;
      if (def.alias.includes(norm)) {
        usados.add(def.campo);
        return def.campo;
      }
    }
    return null;
  });
}

/** Cuántas columnas reconoce una fila (para encontrar la cabecera). */
export function columnasReconocidas(fila: unknown[]): number {
  return autoMapear(fila).filter(Boolean).length;
}

/**
 * La cabecera es la primera fila (de las 10 primeras) que reconoce el nombre o
 * el SKU y al menos dos columnas. Los Excel reales traen títulos arriba (Siigo
 * pone la cabecera en la fila 5). `-1` si no hay.
 */
export function encontrarFilaCabecera(matriz: unknown[][]): number {
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    const mapa = autoMapear(matriz[i] ?? []);
    const reconocidas = mapa.filter(Boolean).length;
    if (reconocidas >= 2 && (mapa.includes('name') || mapa.includes('sku'))) return i;
  }
  return -1;
}

/** Campos obligatorios que el mapeo no cubre. */
export function camposObligatoriosFaltantes(mapeo: Mapeo): CampoProducto[] {
  return CAMPOS.filter((c) => c.obligatorio && !mapeo.includes(c.campo)).map((c) => c.campo);
}

/** Cambia el campo de una columna; si otro ya lo tenía, se lo quita (un campo, una columna). */
export function reasignarColumna(mapeo: Mapeo, columna: number, campo: CampoProducto | null): Mapeo {
  return mapeo.map((c, i) => {
    if (i === columna) return campo;
    if (campo && c === campo) return null;
    return c;
  });
}
