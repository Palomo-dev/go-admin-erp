/**
 * Export «Ítems» de Alegra → filas del importador, ya corregidas.
 *
 * El export se lee con el mapeo genérico (alias en `campos.ts`: «Precio base»,
 * «Costo inicial», «Ítem inventariable»…) y después se ajusta lo que Alegra
 * trae de una forma que, tal cual, dejaría el catálogo mal configurado.
 * Verificado con un export real de un restaurante (133 ítems, 2026-10-04):
 *
 *   - «Costo inicial» muchas veces es el precio de venta copiado (con o sin
 *     impuesto): un costo igual o mayor que el precio sin impuesto no es un
 *     costo; se descarta y el costo real saldrá de compras o recetas.
 *   - «Tipo = Combo»: el export no trae sus componentes. Entra como producto
 *     con la etiqueta «Combo», sin inventario propio (lo descuentan sus
 *     componentes cuando se arme su receta).
 *   - «Unidad = Servicio» con «Tipo = Producto»: es un servicio.
 *   - «Datos iniciales DIAN» (referencia IMPORT-DTS-DIAN) es una fila interna de
 *     Alegra: se excluye por defecto (se puede volver a incluir).
 *   - Sin categoría: se sugiere una por palabras del nombre (bebidas, snacks,
 *     desayunos…); la sugerencia se ve como aviso y se puede editar.
 *   - Platos preparados marcados «inventariables» sin existencias: no llevan
 *     inventario propio (se descuentan por receta).
 *
 * Puro: sin React ni Supabase.
 */

import type { Matriz } from '@/lib/importacion/libro';
import { normalizarCabecera, normalizarNombre } from './texto';
import type { FilaImport, Mensaje } from './tipos';

/** Columnas que solo trae el export de Alegra (normalizadas). */
const MARCAS_ALEGRA = ['iteminventariable', 'preciobase', 'preciototal'];

export function esExportAlegra(cabecera: readonly unknown[] | undefined): boolean {
  const c = new Set((cabecera ?? []).map(normalizarCabecera));
  return MARCAS_ALEGRA.every((m) => c.has(m));
}

/** Categorías sugeridas: la primera regla que coincide con el nombre. */
const REGLAS_CATEGORIA: readonly { categoria: string; preparado: boolean; patron: RegExp }[] = [
  { categoria: 'Estación de café', preparado: true, patron: /\b(estacion de cafe|termo de cafe)\b/ },
  { categoria: 'Desayunos', preparado: true, patron: /\b(desayuno|waffle|omelette|arepa)\b/ },
  { categoria: 'Bebidas', preparado: false, patron: /^(coca cola|agua|gatorade|h2o|hit|mr tea|pony|vive100|postobon|gaseosa|cerveza|soda|jugo hit|botella de agua|te |cafe )/ },
  { categoria: 'Snacks', preparado: false, patron: /\b(galletas?|snacks?|mani|barra de granola|compota|papas chips|palitos? de queso|palito horneado)\b/ },
  { categoria: 'Menú del día', preparado: true, patron: /^(menu|semana \d|plato permanente|plato del dia)/ },
  { categoria: 'Almuerzos', preparado: true, patron: /\b(almuerzos?|bowl|tipico|fiambres|ejecutivo)\b/ },
  { categoria: 'Refrigerios y postres', preparado: true, patron: /\b(parfait|salpicon|ensalada de frutas?|vaso de fruta|yogurt?|refrigerios?|crepa|helado|postre)\b/ },
  { categoria: 'Sándwiches y wraps', preparado: true, patron: /\b(sandwich|sandwiches|panino|wrapp?|croissant|croasaint|hamburguesa|hojaldrado|pastel)\b/ },
];

export function categoriaSugerida(nombre: string): { categoria: string; preparado: boolean } | null {
  const n = normalizarNombre(nombre);
  const r = REGLAS_CATEGORIA.find((x) => x.patron.test(n));
  return r ? { categoria: r.categoria, preparado: r.preparado } : null;
}

const FILA_INTERNA = /^import dts dian$/;

export interface FilaAlegra extends FilaImport {
  /** La fila arranca excluida en la previsualización (se puede volver a incluir). */
  excluirPorDefecto?: boolean;
}

/**
 * Corrige las filas ya leídas con el mapeo genérico. `matriz` y `filaCabecera`
 * dan acceso a columnas que el mapeo no usa («Tipo» de Alegra, «Precio total»).
 */
export function ajustarFilasAlegra(matriz: Matriz, filaCabecera: number, filas: FilaImport[]): FilaAlegra[] {
  const cab = (matriz[filaCabecera] ?? []).map(normalizarCabecera);
  const col = (nombre: string) => cab.indexOf(nombre);
  const iTipo = col('tipo');
  const iTotal = col('preciototal');
  const iUnidad = col('unidaddemedida');
  const iRef = col('referencia');
  const num = (v: unknown) => {
    const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  return filas.map((original) => {
    const f: FilaAlegra = { ...original };
    const crudo = matriz[f.fila - 1] ?? [];
    const tipo = normalizarNombre(iTipo >= 0 ? crudo[iTipo] : f.type);
    const unidad = normalizarNombre(iUnidad >= 0 ? crudo[iUnidad] : f.unit);
    const total = iTotal >= 0 ? num(crudo[iTotal]) : null;
    const ref = normalizarNombre(iRef >= 0 ? crudo[iRef] : f.reference);
    const avisos: Mensaje[] = [...(f.avisosLectura ?? [])];

    if (FILA_INTERNA.test(ref)) {
      f.excluirPorDefecto = true;
      avisos.push({ codigo: 'filaInternaAlegra' });
    }

    // Servicio: por tipo o por unidad.
    const servicio = tipo === 'servicio' || unidad === 'servicio';
    if (servicio) {
      f.type = 'Servicio';
      f.trackStock = false;
    }

    // Costo que en realidad es el precio de venta.
    if (f.cost !== undefined && f.cost > 0 && f.price !== undefined && f.price > 0) {
      const esPrecio = f.cost >= f.price || (total !== null && Math.abs(f.cost - total) < 1);
      if (esPrecio) {
        avisos.push({ codigo: 'costoAlegraDescartado', params: { costo: f.cost } });
        delete f.cost;
      }
    }

    // Combo: sin componentes en el export.
    if (tipo === 'combo') {
      f.type = 'Producto';
      f.trackStock = false;
      f.tags = [f.tags, 'Combo'].filter(Boolean).join(';');
      avisos.push({ codigo: 'comboSinComponentes' });
    }

    // Categoría sugerida y platos preparados sin inventario propio.
    const sugerida = f.name ? categoriaSugerida(f.name) : null;
    if (!f.category?.trim() && !servicio) {
      if (sugerida) {
        f.category = sugerida.categoria;
        avisos.push({ codigo: 'categoriaSugerida', params: { categoria: sugerida.categoria } });
      }
    }
    if (sugerida?.preparado && f.trackStock && !servicio && tipo !== 'combo') {
      f.trackStock = false;
      avisos.push({ codigo: 'preparadoSinInventario' });
    }

    if (avisos.length) f.avisosLectura = avisos;
    return f;
  });
}
