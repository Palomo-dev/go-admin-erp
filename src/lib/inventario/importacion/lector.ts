/**
 * Lectura de archivos CSV / XLS / XLSX para el importador de productos.
 *
 * Conserva los tres formatos que reconocía el importador anterior:
 *   - genérico / plantilla GO Admin / Siigo «Gestión de productos y servicios»
 *     (cabeceras reconocidas por alias, ahora con mapeo editable);
 *   - «Space» (Producto · Categoría · P. Venta · Descuento · Promoción 2x, sin
 *     SKU): SKU `SP-…`, tamaños como variantes, promo 2x1 en notas;
 *   - «Sistema» (secciones como filas de una celda · Valor compra · Valor
 *     venta, sin SKU): SKU `VE-…`, costo/precio intercambiados si vienen al revés.
 * Y el archivo opcional de saldos de Siigo («Código producto» · «Total» ·
 * «Valor unitario»).
 */

import { filaVacia, leerLibro, type Matriz } from '@/lib/importacion/libro';
import { autoMapear, encontrarFilaCabecera, type CampoProducto, type Mapeo } from './campos';
import { normalizarCabecera, parseBooleano, parseNumero, slugificar, textoCelda } from './texto';
import type { FilaImport, Mensaje } from './tipos';

// La lectura del libro vive en `@/lib/importacion/libro` (compartida con el
// importador de leads); se reexporta para no mover los imports de productos.
export { decodificarCsv, extensionAdmitida, EXTENSIONES_ADMITIDAS, filaVacia, type Matriz } from '@/lib/importacion/libro';
export type FormatoArchivo = 'generico' | 'space' | 'sistema';

/** 10 MB: un catálogo de 20 000 productos en CSV pesa ~4 MB. */
export const TAMANO_MAXIMO_ARCHIVO = 10 * 1024 * 1024;

/** Primera hoja del archivo como matriz (filas × celdas), sin filas completamente vacías al final. */
export function leerMatriz(buffer: ArrayBuffer, nombre: string): Matriz {
  return leerLibro(buffer, nombre).matriz();
}

// ─── Detección de formato ──────────────────────────────────────────────────

/** Formato «Space»: Producto + Categoría + P. Venta y SIN código/SKU. Devuelve la fila de cabecera o -1. */
export function detectarFormatoSpace(matriz: Matriz): number {
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    const celdas = (matriz[i] ?? []).map(normalizarCabecera);
    const tiene = (...alias: string[]) => celdas.some((c) => alias.includes(c));
    if (tiene('producto') && tiene('categoria') && tiene('pventa', 'precio', 'preciodeventa') && !tiene('codigo', 'sku')) return i;
  }
  return -1;
}

/**
 * Formato «Sistema»: ≥ 3 columnas, alguna dice «compra» y otra «venta», y la
 * primera celda es el nombre de la primera sección (no «código»/«nombre»).
 */
export function detectarFormatoSistema(matriz: Matriz): number {
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    const fila = matriz[i] ?? [];
    if (fila.length < 3) continue;
    const celdas = fila.map((c) => String(c ?? '').toLowerCase().trim());
    const primera = normalizarCabecera(celdas[0]);
    const generica = ['codigo', 'sku', 'producto', 'nombre', 'name', 'tipo', 'type'].includes(primera);
    if (celdas.some((c) => c.includes('compra')) && celdas.some((c) => c.includes('venta')) && !generica && primera) return i;
  }
  return -1;
}

export function detectarFormato(matriz: Matriz): { formato: FormatoArchivo; filaCabecera: number } {
  const sistema = detectarFormatoSistema(matriz);
  if (sistema !== -1) return { formato: 'sistema', filaCabecera: sistema };
  const space = detectarFormatoSpace(matriz);
  if (space !== -1) return { formato: 'space', filaCabecera: space };
  return { formato: 'generico', filaCabecera: -1 };
}

// ─── Formato genérico con mapeo ────────────────────────────────────────────

const CAMPOS_NUMERICOS: CampoProducto[] = ['price', 'comparePrice', 'cost', 'stock', 'minLevel'];
const CAMPOS_BOOLEANOS: CampoProducto[] = ['trackStock', 'isParent'];

/** Aplica el mapeo a las filas que siguen a la cabecera. Las filas vacías se saltan. */
export function leerFilas(matriz: Matriz, filaCabecera: number, mapeo: Mapeo): FilaImport[] {
  const filas: FilaImport[] = [];
  for (let i = filaCabecera + 1; i < matriz.length; i++) {
    const fila = matriz[i];
    if (filaVacia(fila)) continue;
    const f: FilaImport = { fila: i + 1 };
    const destino = f as unknown as Record<string, unknown>;
    mapeo.forEach((campo, col) => {
      if (!campo) return;
      const v = fila[col];
      if (v === null || v === undefined || String(v).trim() === '') return;
      if (CAMPOS_NUMERICOS.includes(campo)) {
        const n = parseNumero(v);
        if (n !== null) destino[campo] = n;
      } else if (CAMPOS_BOOLEANOS.includes(campo)) {
        const b = parseBooleano(v);
        if (b !== undefined) destino[campo] = b;
      } else {
        destino[campo] = String(v).trim();
      }
    });
    filas.push(f);
  }
  return filas;
}

/**
 * Variantes por prefijo de SKU (comportamiento del importador anterior):
 * `PROD-134-KMR-V1` es hija de `PROD-134-KMR` si ese SKU está en el archivo.
 * Marca además a los padres. Devuelve cuántas se vincularon.
 */
export function detectarVariantesPorSku(filas: FilaImport[]): number {
  const skus = new Set(filas.map((f) => f.sku).filter((s): s is string => !!s));
  let vinculadas = 0;
  for (const f of filas) {
    if (!f.sku || f.parentSku || f.isParent !== undefined) continue;
    const partes = f.sku.split(/[-_]/);
    for (let i = partes.length - 1; i > 0; i--) {
      const guion = partes.slice(0, i).join('-');
      const bajo = partes.slice(0, i).join('_');
      const padre = skus.has(guion) ? guion : skus.has(bajo) ? bajo : null;
      if (padre && padre !== f.sku) {
        f.parentSku = padre;
        f.isParent = false;
        vinculadas++;
        break;
      }
    }
  }
  const padres = new Set(filas.filter((f) => f.parentSku).map((f) => f.parentSku));
  for (const f of filas) if (f.sku && padres.has(f.sku) && f.isParent === undefined) f.isParent = true;
  return vinculadas;
}

// ─── SKU generado ──────────────────────────────────────────────────────────

/** Generador de SKU únicos dentro de una lectura: `PREFIJO-slug-del-nombre[-n]`. */
export function crearGeneradorSku(prefijo: string, ocupados: Iterable<string> = []) {
  const vistos = new Set<string>(Array.from(ocupados, (s) => s.toUpperCase()));
  return (nombre: string, respaldo: number): string => {
    let base = `${prefijo}-${slugificar(nombre).slice(0, 40).toUpperCase()}`;
    if (base === `${prefijo}-`) base = `${prefijo}-${String(respaldo).padStart(3, '0')}`;
    let sku = base;
    let n = 1;
    while (vistos.has(sku.toUpperCase())) {
      n++;
      sku = `${base}-${n}`;
    }
    vistos.add(sku.toUpperCase());
    return sku;
  };
}

// ─── Formato «Space» ───────────────────────────────────────────────────────

const PREFIJOS_TAMANO: Array<[string, string]> = [
  ['EXTRAGRANDE', 'Extragrande'],
  ['EXTRA GRANDE', 'Extragrande'],
  ['EXTRA', 'Extra'],
  ['GRANDE', 'Grande'],
  ['GRAN', 'Grande'],
  ['MEDIANO', 'Mediano'],
  ['MED', 'Mediano'],
  ['PEQUEÑO', 'Pequeño'],
  ['PEQUE', 'Pequeño'],
  ['PEQUEO', 'Pequeño'],
  ['1LT', '1 Litro'],
  ['1 LT', '1 Litro'],
  ['LITRO', '1 Litro'],
  ['1L', '1 Litro'],
  ['MEDIA DE', 'Media'],
  ['MEDIA', 'Media'],
];

/** «PEQUEÑO GRANI CON LICOR» → { tamano: 'Pequeño', base: 'GRANI CON LICOR' }. */
export function detectarTamano(nombre: string): { tamano: string; base: string } | undefined {
  const mayus = nombre.toUpperCase().trim();
  for (const [prefijo, tamano] of PREFIJOS_TAMANO) {
    if (mayus.startsWith(prefijo + ' ')) {
      const base = nombre.trim().substring(prefijo.length).trim();
      if (base) return { tamano, base };
    }
  }
  return undefined;
}

function avisoPromo(normal?: number, descuento?: number, total?: number): Mensaje | undefined {
  if (!descuento || descuento <= 0 || !normal || normal <= descuento) return undefined;
  return { codigo: 'promoEnNotas', params: { unitario: descuento, normal, total: total && total > 0 ? total : '' } };
}

function notaPromo(normal?: number, descuento?: number, total?: number): string | undefined {
  if (!descuento || descuento <= 0 || !normal || normal <= descuento) return undefined;
  return total && total > 0
    ? `Promo 2x1 (buy_x_get_y en /app/pos/promociones): 2 por ${total} (c/u ${descuento}, normal ${normal})`
    : `Promo 2x1 (buy_x_get_y en /app/pos/promociones): c/u ${descuento} (normal ${normal})`;
}

export function parsearFormatoSpace(matriz: Matriz, filaCabecera: number): FilaImport[] {
  const cab = (matriz[filaCabecera] ?? []).map(normalizarCabecera);
  const idx = (...alias: string[]) => cab.findIndex((c) => alias.includes(c));
  const iNombre = idx('producto', 'nombre', 'name');
  const iCategoria = idx('categoria', 'category');
  const iPrecio = idx('pventa', 'precio', 'preciodeventa', 'price');
  const iDescuento = idx('descuento', 'discount');
  const iPromo = cab.findIndex((c) => c.includes('promo'));
  if (iNombre === -1 || iPrecio === -1) return [];

  interface Crudo { fila: number; nombre: string; categoria?: string; precio?: number; descuento?: number; promo?: number; tamano?: { tamano: string; base: string } }
  const crudos: Crudo[] = [];
  for (let i = filaCabecera + 1; i < matriz.length; i++) {
    const f = matriz[i];
    const nombre = textoCelda(f?.[iNombre]);
    if (!f || !nombre) continue;
    crudos.push({
      fila: i + 1,
      nombre,
      categoria: iCategoria !== -1 ? textoCelda(f[iCategoria]) : undefined,
      precio: parseNumero(f[iPrecio]) || undefined,
      descuento: iDescuento !== -1 ? parseNumero(f[iDescuento]) || undefined : undefined,
      promo: iPromo !== -1 ? parseNumero(f[iPromo]) || undefined : undefined,
      tamano: detectarTamano(nombre),
    });
  }

  // Dos o más tamaños del mismo nombre base en la misma categoría = variantes.
  const grupos = new Map<string, Crudo[]>();
  for (const c of crudos) {
    if (!c.tamano) continue;
    const k = `${c.tamano.base.toLowerCase()}|${(c.categoria ?? '').toLowerCase()}`;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const enGrupo = new Set<Crudo>();
  for (const g of grupos.values()) if (g.length >= 2) g.forEach((c) => enGrupo.add(c));

  const sku = crearGeneradorSku('SP');
  const filas: FilaImport[] = [];
  const conPromo = (f: FilaImport, normal?: number, desc?: number, total?: number) => {
    const aviso = avisoPromo(normal, desc, total);
    f.notes = notaPromo(normal, desc, total);
    f.avisosLectura = [{ codigo: 'skuGenerado' }, ...(aviso ? [aviso] : [])];
    return f;
  };

  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const primero = g[0];
    const precios = g.map((c) => c.precio).filter((p): p is number => !!p);
    const precioPadre = precios.length ? Math.min(...precios) : undefined;
    const skuPadre = sku(primero.tamano!.base, primero.fila);
    filas.push(
      conPromo(
        { fila: primero.fila, sku: skuPadre, name: primero.tamano!.base, type: 'Producto', category: primero.categoria, unit: 'Unidad', price: precioPadre, stock: 0, isParent: true, skuGenerado: true },
        precioPadre,
        g.find((c) => c.descuento)?.descuento,
        g.find((c) => c.promo)?.promo,
      ),
    );
    for (const c of g) {
      filas.push(
        conPromo(
          { fila: c.fila, sku: sku(c.nombre, c.fila), name: c.nombre, type: 'Producto', category: c.categoria, unit: 'Unidad', price: c.precio, stock: 0, parentSku: skuPadre, isParent: false, variantData: JSON.stringify({ Tamaño: c.tamano!.tamano }), skuGenerado: true },
          c.precio,
          c.descuento,
          c.promo,
        ),
      );
    }
  }
  for (const c of crudos) {
    if (enGrupo.has(c)) continue;
    filas.push(conPromo({ fila: c.fila, sku: sku(c.nombre, c.fila), name: c.nombre, type: 'Producto', category: c.categoria, unit: 'Unidad', price: c.precio, stock: 0, skuGenerado: true }, c.precio, c.descuento, c.promo));
  }
  // Orden estable: por fila y, a igual fila (padre y su primera variante), el padre primero.
  return filas.sort((a, b) => a.fila - b.fila || Number(!!b.isParent) - Number(!!a.isParent));
}

// ─── Formato «Sistema» ─────────────────────────────────────────────────────

/** En este formato la coma es de miles y el punto decimal: "1,191" → 1191, "143.5" → 143.5. */
export function numeroSistema(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).trim().replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parsearFormatoSistema(matriz: Matriz, filaCabecera: number): FilaImport[] {
  const sku = crearGeneradorSku('VE');
  const filas: FilaImport[] = [];
  let categoria = textoCelda(matriz[filaCabecera]?.[0]);
  for (let i = filaCabecera + 1; i < matriz.length; i++) {
    const f = matriz[i];
    if (!f) continue;
    const llenas = f.filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (llenas.length === 0) continue;
    if (llenas.length === 1) {
      categoria = textoCelda(llenas[0]) ?? categoria;
      continue;
    }
    const nombre = textoCelda(f[0]);
    if (!nombre) continue;
    let costo = numeroSistema(f[1]);
    let precio = numeroSistema(f[2]);
    if (precio === undefined && costo !== undefined && (f[2] === undefined || f[2] === null)) {
      precio = costo;
      costo = undefined;
    }
    const avisos: Mensaje[] = [{ codigo: 'skuGenerado' }];
    if (costo !== undefined && precio !== undefined && costo > precio) {
      [costo, precio] = [precio, costo];
      avisos.push({ codigo: 'costoPrecioIntercambiados' });
    }
    filas.push({ fila: i + 1, sku: sku(nombre, i + 1), name: nombre, type: 'Producto', category: categoria, unit: 'Unidad', cost: costo, price: precio, stock: 0, avisosLectura: avisos, skuGenerado: true });
  }
  return filas;
}

// ─── Archivo de saldos (Siigo) ─────────────────────────────────────────────

export interface Saldo {
  stock: number;
  costoUnitario?: number;
}

/** «Código producto» · «Total» · «Valor unitario». `null` si no se reconoce la estructura. */
export function leerSaldos(matriz: Matriz): Map<string, Saldo> | null {
  let cab = -1;
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    if ((matriz[i] ?? []).some((c) => normalizarCabecera(c).includes('codigoproducto'))) {
      cab = i;
      break;
    }
  }
  if (cab === -1) return null;
  const h = (matriz[cab] ?? []).map(normalizarCabecera);
  const iCodigo = h.findIndex((c) => c.includes('codigoproducto'));
  const iTotal = h.findIndex((c) => c.includes('totalenproductos')) !== -1 ? h.findIndex((c) => c.includes('totalenproductos')) : h.findIndex((c) => c.includes('total') && !c.includes('valor'));
  const iUnitario = h.findIndex((c) => c.includes('valorunitario'));
  const saldos = new Map<string, Saldo>();
  for (let i = cab + 1; i < matriz.length; i++) {
    const codigo = textoCelda(matriz[i]?.[iCodigo]);
    if (!codigo) continue;
    saldos.set(codigo, {
      stock: iTotal !== -1 ? parseNumero(matriz[i][iTotal]) ?? 0 : 0,
      costoUnitario: iUnitario !== -1 ? parseNumero(matriz[i][iUnitario]) || undefined : undefined,
    });
  }
  return saldos;
}

/** Aplica los saldos: el archivo de saldos manda sobre la columna de stock (y su costo, si trae). */
export function aplicarSaldos(filas: FilaImport[], saldos: Map<string, Saldo> | null | undefined): number {
  if (!saldos || saldos.size === 0) return 0;
  let aplicados = 0;
  for (const f of filas) {
    const s = f.sku ? saldos.get(f.sku) : undefined;
    if (!s) continue;
    f.stock = s.stock;
    if (s.costoUnitario && s.costoUnitario > 0) f.cost = s.costoUnitario;
    aplicados++;
  }
  return aplicados;
}

/** Lectura completa según el formato detectado (el genérico usa el mapeo dado o el automático). */
export function leerSegunFormato(
  matriz: Matriz,
  mapeoManual?: { filaCabecera: number; mapeo: Mapeo },
): { formato: FormatoArchivo; filaCabecera: number; mapeo: Mapeo; filas: FilaImport[] } {
  const det = detectarFormato(matriz);
  if (det.formato === 'sistema') return { ...det, mapeo: [], filas: parsearFormatoSistema(matriz, det.filaCabecera) };
  if (det.formato === 'space') return { ...det, mapeo: [], filas: parsearFormatoSpace(matriz, det.filaCabecera) };
  const filaCabecera = mapeoManual?.filaCabecera ?? encontrarFilaCabecera(matriz);
  if (filaCabecera === -1) return { formato: 'generico', filaCabecera, mapeo: [], filas: [] };
  const mapeo = mapeoManual?.mapeo ?? autoMapear(matriz[filaCabecera] ?? []);
  const filas = leerFilas(matriz, filaCabecera, mapeo);
  return { formato: 'generico', filaCabecera, mapeo, filas };
}

