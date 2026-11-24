/**
 * «Importar precios» (Figma 03, 3020:273733): lee un Excel (.xlsx/.xls) o CSV en el navegador y lo
 * deja en filas `{fila, sku, price, min_qty}`. NO valida contra la base: eso lo hace el servidor
 * (`price_list_import`) en una sola transacción. Aquí solo se reconocen las columnas y se
 * normalizan los números escritos a la colombiana («$ 9.000», «8.700,50»).
 */
import Papa from 'papaparse';

export interface FilaArchivoPrecios {
  /** Fila del archivo (la 1 es el encabezado). */
  fila: number;
  sku: string | null;
  /** Precio normalizado con punto decimal («9000», «8700.5»), o el texto tal cual si no se entiende. */
  price: string | null;
  min_qty: string | null;
}

export interface ArchivoLeido {
  filas: FilaArchivoPrecios[];
  /** Columnas reconocidas, para «columnas: SKU, precio, desde cantidad». */
  columnas: { sku: string | null; precio: string | null; cantidad: string | null };
}

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s: unknown) => quitarTildes(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ALIAS_SKU = ['sku', 'codigo', 'codigo sku', 'referencia', 'ref', 'codigo de barras', 'barcode', 'code', 'reference', 'code barre', 'codigo de barras ean'];
const ALIAS_PRECIO = ['precio', 'precio lista', 'precio de lista', 'nuevo precio', 'price', 'prix', 'preco', 'valor'];
const ALIAS_CANTIDAD = ['desde cantidad', 'desde', 'cantidad minima', 'cantidad', 'min qty', 'min_qty', 'minimo', 'from qty', 'quantite', 'quantidade', 'a partir de'];

function columna(encabezados: string[], alias: string[]): number {
  const claves = encabezados.map(clave);
  for (const a of alias) {
    const i = claves.indexOf(clave(a));
    if (i >= 0) return i;
  }
  return claves.findIndex((c) => alias.some((a) => c.includes(clave(a))));
}

/**
 * Número escrito a mano: «$ 9.000» → «9000», «8.700,50» → «8700.50», «1,5» → «1.5»,
 * «12.5» → «12.5». Un solo separador seguido de exactamente tres dígitos es de miles.
 */
export function normalizarNumero(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : null;
  let s = String(valor).trim().replace(/[\s$]|COP/gi, '');
  if (s === '') return null;
  const punto = s.lastIndexOf('.');
  const coma = s.lastIndexOf(',');
  if (punto >= 0 && coma >= 0) {
    const decimal = punto > coma ? '.' : ',';
    const miles = decimal === '.' ? ',' : '.';
    s = s.split(miles).join('').replace(decimal, '.');
  } else if (punto >= 0 || coma >= 0) {
    const sep = punto >= 0 ? '.' : ',';
    const partes = s.split(sep);
    const deMiles = partes.length > 2 || (partes.length === 2 && partes[1].length === 3);
    s = deMiles ? partes.join('') : partes.join('.');
  }
  return /^\d+(\.\d+)?$/.test(s) ? s : String(valor).trim();
}

function desdeMatriz(matriz: unknown[][]): ArchivoLeido {
  const vacia = (f: unknown[]) => f.every((c) => String(c ?? '').trim() === '');
  const inicio = matriz.findIndex((f) => !vacia(f));
  if (inicio < 0) return { filas: [], columnas: { sku: null, precio: null, cantidad: null } };
  const encabezados = matriz[inicio].map((c) => String(c ?? ''));
  const iSku = columna(encabezados, ALIAS_SKU);
  const iPrecio = columna(encabezados, ALIAS_PRECIO);
  const iCant = columna(encabezados, ALIAS_CANTIDAD);
  const filas: FilaArchivoPrecios[] = [];
  for (let r = inicio + 1; r < matriz.length; r++) {
    const f = matriz[r];
    if (!f || vacia(f)) continue;
    const sku = iSku >= 0 ? String(f[iSku] ?? '').trim() : '';
    filas.push({
      fila: r + 1,
      sku: sku || null,
      price: iPrecio >= 0 ? normalizarNumero(f[iPrecio]) : null,
      min_qty: iCant >= 0 ? normalizarNumero(f[iCant]) : null,
    });
  }
  return {
    filas,
    columnas: {
      sku: iSku >= 0 ? encabezados[iSku] : null,
      precio: iPrecio >= 0 ? encabezados[iPrecio] : null,
      cantidad: iCant >= 0 ? encabezados[iCant] : null,
    },
  };
}

export function leerCsv(texto: string): ArchivoLeido {
  const r = Papa.parse<string[]>(texto.replace(/^﻿/, ''), { skipEmptyLines: false, delimiter: '' });
  return desdeMatriz(r.data as unknown[][]);
}

export async function leerArchivoPrecios(archivo: File): Promise<ArchivoLeido> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return leerCsv(await archivo.text());
  const XLSX = await import('xlsx');
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: '' });
  return desdeMatriz(matriz);
}

/** Plantilla CSV: columnas y un ejemplo (Figma 03, «Descargar plantilla»). */
export function plantillaCsv(encabezados: { sku: string; precio: string; cantidad: string }): string {
  return `${encabezados.sku},${encabezados.precio},${encabezados.cantidad}\nBEB-0400,9000,1\nBEB-0400,8700,12\n`;
}

/** Exporta los precios fijos de una lista en el mismo formato de la plantilla. */
export function exportarCsv(
  encabezados: { sku: string; precio: string; cantidad: string; producto: string },
  productos: readonly { sku: string | null; name: string; escalones: readonly { min_qty: number; price: number }[] }[],
): string {
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lineas = [`${encabezados.sku},${encabezados.precio},${encabezados.cantidad},${encabezados.producto}`];
  for (const p of productos) {
    for (const e of p.escalones) lineas.push([esc(p.sku ?? ''), String(e.price), String(e.min_qty), esc(p.name)].join(','));
  }
  return `${lineas.join('\n')}\n`;
}
