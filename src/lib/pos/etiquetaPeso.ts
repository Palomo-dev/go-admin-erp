/**
 * Etiquetas de peso variable de balanzas etiquetadoras
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.7, fase 4).
 *
 * EAN-13 de uso interno GS1:
 *   PP (prefijo 21–29) + PLU (4–6) + [dígito de control del valor] + valor (4–6) + dígito EAN
 *
 *   `27 00104 00735 3` → PLU 104, 0,735 kg (peso embebido, en gramos)
 *   `28 00104 13892 x` → PLU 104, $ 13.892 (precio embebido)
 *
 * Puro: lo usan el lector del POS (web, Desktop y móvil) y las pruebas. El
 * orden de resolución lo fija el POS: primero el código EXACTO en
 * `products.barcode` (el generador interno usa el prefijo 20 y hay productos
 * con códigos propios que empiezan por 2x); solo si no existe se decodifica.
 * El formato es el de la organización (`organization_barcode_settings.weight_label_*`).
 */

import { digitoControlGs1, esEan13Valido } from '@/lib/utils/codigoBarras';
import { codigoUnidad, decimalesCantidad, esMedido, type ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import { validarPesada, type Pesaje } from '@/lib/pos/peso/pesada';

export type ContenidoEtiqueta = 'weight' | 'price';

/** Formato de etiqueta de la organización (columnas `weight_label_*`). */
export interface FormatoEtiquetaPeso {
  activo: boolean;
  /** Prefijos de 2 dígitos (21–29). Nunca el 20 del generador interno. */
  prefijos: readonly string[];
  contenido: ContenidoEtiqueta;
  digitosPlu: number;
  digitosValor: number;
  /** Hay un dígito de control del valor entre el PLU y el valor. */
  digitoControlValor: boolean;
}

/** Recomendación del dueño (2026-09-29): peso embebido, prefijo 27, PLU 5, peso 5 (gramos). */
export const FORMATO_ETIQUETA_RECOMENDADO: FormatoEtiquetaPeso = {
  activo: true,
  prefijos: ['27'],
  contenido: 'weight',
  digitosPlu: 5,
  digitosValor: 5,
  digitoControlValor: false,
};

/** Prefijos GS1 de uso interno admitidos para etiquetas de peso (el 20 queda para el generador). */
export const PREFIJOS_PESO_PERMITIDOS = ['21', '22', '23', '24', '25', '26', '27', '28', '29'] as const;

export type MotivoEtiquetaInvalida = 'digito_control' | 'digito_valor';

export interface EtiquetaPeso {
  codigo: string;
  prefijo: string;
  plu: number;
  contenido: ContenidoEtiqueta;
  /** Valor entero tal como viene: gramos (o milésimas de libra) o importe en unidades de la moneda. */
  valor: number;
}

export type ResultadoEtiquetaPeso =
  /** No encaja en el formato (no es EAN-13, prefijo ajeno o formato inactivo): es un «no encontrado» normal. */
  | { tipo: 'no_es_etiqueta' }
  /** Encaja en el formato pero no es legible: no se agrega nada. */
  | { tipo: 'invalida'; motivo: MotivoEtiquetaInvalida }
  | { tipo: 'etiqueta'; etiqueta: EtiquetaPeso };

/** ¿Es un formato completo y coherente (2 + PLU + [1] + valor = 12)? */
export function formatoEtiquetaValido(f: FormatoEtiquetaPeso | null | undefined): f is FormatoEtiquetaPeso {
  if (!f) return false;
  const enRango = (n: number) => Number.isInteger(n) && n >= 4 && n <= 6;
  if (!enRango(f.digitosPlu) || !enRango(f.digitosValor)) return false;
  if (2 + f.digitosPlu + f.digitosValor + (f.digitoControlValor ? 1 : 0) !== 12) return false;
  return f.prefijos.every((p) => (PREFIJOS_PESO_PERMITIDOS as readonly string[]).includes(p));
}

// ── Dígito de control del valor (GS1 General Specifications, 7.9.3) ────────

/** Productos ponderados 2-, 3, 5+ y 5- de un dígito (tablas GS1). */
const PONDERADO: Record<'2-' | '3' | '5+' | '5-', readonly number[]> = {
  '2-': [0, 2, 4, 6, 8, 9, 1, 3, 5, 7],
  '3': [0, 3, 6, 9, 2, 5, 8, 1, 4, 7],
  '5+': [0, 5, 1, 6, 2, 7, 3, 8, 4, 9],
  '5-': [0, 5, 9, 4, 8, 3, 7, 2, 6, 1],
};

/**
 * Dígito de control de un valor de precio o peso de 4 o 5 dígitos.
 *   4 dígitos: pesos 2-, 2-, 3, 5-; el dígito es la unidad de (suma × 3).
 *   5 dígitos: pesos 5+, 2-, 5-, 5+, 2-; el dígito es el que ponderado con 5-
 *   da (10 − suma mod 10) mod 10.
 * `null` si el valor no tiene 4 o 5 dígitos (con 6 no hay dígito de control del valor).
 */
export function digitoControlValor(valor: string): number | null {
  if (!/^\d{4,5}$/.test(valor)) return null;
  const d = Array.from(valor, (c) => c.charCodeAt(0) - 48);
  if (d.length === 4) {
    const pesos = ['2-', '2-', '3', '5-'] as const;
    const suma = d.reduce((s, x, i) => s + PONDERADO[pesos[i]][x], 0);
    return (suma * 3) % 10;
  }
  const pesos = ['5+', '2-', '5-', '5+', '2-'] as const;
  const suma = d.reduce((s, x, i) => s + PONDERADO[pesos[i]][x], 0);
  const objetivo = (10 - (suma % 10)) % 10;
  return PONDERADO['5-'].indexOf(objetivo);
}

// ── Decodificación ─────────────────────────────────────────────────────────

/**
 * Decodifica un código leído con el formato de la organización. No busca nada:
 * quien llama ya comprobó que el código EXACTO no existe en `products.barcode`.
 * Reutiliza el dígito de control GS1 de `codigoBarras.ts`.
 */
export function decodificarEtiquetaPeso(codigo: string, formato: FormatoEtiquetaPeso | null | undefined): ResultadoEtiquetaPeso {
  const limpio = (codigo ?? '').trim();
  if (!formato || !formato.activo || !formatoEtiquetaValido(formato)) return { tipo: 'no_es_etiqueta' };
  if (!/^\d{13}$/.test(limpio)) return { tipo: 'no_es_etiqueta' };
  const prefijo = limpio.slice(0, 2);
  if (!formato.prefijos.includes(prefijo)) return { tipo: 'no_es_etiqueta' };
  if (!esEan13Valido(limpio)) return { tipo: 'invalida', motivo: 'digito_control' };

  const inicioPlu = 2;
  const finPlu = inicioPlu + formato.digitosPlu;
  const plu = Number(limpio.slice(inicioPlu, finPlu));
  const inicioValor = finPlu + (formato.digitoControlValor ? 1 : 0);
  const valorTxt = limpio.slice(inicioValor, inicioValor + formato.digitosValor);
  if (formato.digitoControlValor) {
    const esperado = digitoControlValor(valorTxt);
    if (esperado === null || esperado !== Number(limpio[finPlu])) return { tipo: 'invalida', motivo: 'digito_valor' };
  }
  return {
    tipo: 'etiqueta',
    etiqueta: { codigo: limpio, prefijo, plu, contenido: formato.contenido, valor: Number(valorTxt) },
  };
}

/** Arma una etiqueta válida (para pruebas y para la vista previa del formato). */
export function construirEtiquetaPeso(formato: FormatoEtiquetaPeso, prefijo: string, plu: number, valor: number): string {
  const pluTxt = String(plu).padStart(formato.digitosPlu, '0');
  const valorTxt = String(valor).padStart(formato.digitosValor, '0');
  if (pluTxt.length !== formato.digitosPlu || valorTxt.length !== formato.digitosValor) throw new Error('No cabe en el formato');
  const control = formato.digitoControlValor ? String(digitoControlValor(valorTxt) ?? '') : '';
  const cuerpo = `${prefijo}${pluTxt}${control}${valorTxt}`;
  if (cuerpo.length !== 12) throw new Error('Formato incoherente');
  return `${cuerpo}${digitoControlGs1(cuerpo)}`;
}

// ── De la etiqueta a la línea del carrito ─────────────────────────────────

export type ErrorEtiquetaPeso =
  | MotivoEtiquetaInvalida
  | 'plu_inexistente'
  | 'producto_por_unidad'
  | 'sin_precio'
  | 'peso_invalido'
  | 'bajo_minimo';

/** Lo que viaja en `notes.pesaje` para una etiqueta (el checkout copia `notes`). */
export type PesajeEtiqueta = Pesaje & { importe_etiqueta?: number };

export type LineaEtiqueta =
  | { ok: false; error: ErrorEtiquetaPeso; plu?: number; minimo?: number }
  | {
      ok: true;
      cantidad: number;
      pesaje: PesajeEtiqueta;
      /** Precio embebido: el importe recalculado con el precio vigente no coincide con el impreso. */
      aviso: { importeEtiqueta: number; importeCalculado: number } | null;
    };

/**
 * Cantidad de la línea a partir de la etiqueta y del producto hallado por PLU.
 *   Peso embebido: neto = valor ÷ 1000 (gramos → kg, o milésimas de libra → lb).
 *   Precio embebido: cantidad = importe ÷ precio vigente, redondeada a los
 *   decimales del producto; el precio de la línea sigue siendo el vigente (el
 *   impreso no manda) y se avisa si el importe recalculado difiere.
 * El importe impreso viene en unidades enteras de la moneda con 0 decimales
 * (COP, CLP); con `decimalesMoneda` > 0 se interpreta en centavos.
 */
export function lineaDesdeEtiqueta(params: {
  etiqueta: EtiquetaPeso;
  producto: (ProductoModoVenta & { id?: number }) | null;
  precioPorUnidad: number | null;
  decimalesMoneda?: number;
  ahora?: Date;
}): LineaEtiqueta {
  const { etiqueta, producto } = params;
  if (!producto) return { ok: false, error: 'plu_inexistente', plu: etiqueta.plu };
  if (!esMedido(producto)) return { ok: false, error: 'producto_por_unidad', plu: etiqueta.plu };

  const dec = decimalesCantidad(producto);
  const decMoneda = Math.max(0, Math.trunc(params.decimalesMoneda ?? 0));
  let cantidadBruta: number;
  let importeEtiqueta: number | null = null;
  const precio = Number(params.precioPorUnidad);
  if (etiqueta.contenido === 'weight') {
    cantidadBruta = etiqueta.valor / 1000;
  } else {
    if (!Number.isFinite(precio) || precio <= 0) return { ok: false, error: 'sin_precio', plu: etiqueta.plu };
    importeEtiqueta = etiqueta.valor / 10 ** decMoneda;
    cantidadBruta = importeEtiqueta / precio;
  }
  const factor = 10 ** dec;
  const cantidadRedondeada = Math.round(cantidadBruta * factor + Number.EPSILON) / factor;

  // Mismas reglas que una pesada (decimales, mínimo); el origen «etiqueta» no pide permiso de peso a mano.
  const v = validarPesada({ producto, cantidad: cantidadRedondeada, origen: 'etiqueta', permisoPesoManual: false });
  if (!v.ok) {
    if (v.error === 'bajo_minimo') return { ok: false, error: 'bajo_minimo', plu: etiqueta.plu, minimo: v.minimo };
    return { ok: false, error: 'peso_invalido', plu: etiqueta.plu };
  }

  let aviso: { importeEtiqueta: number; importeCalculado: number } | null = null;
  if (importeEtiqueta !== null) {
    const fm = 10 ** decMoneda;
    const importeCalculado = Math.round(v.cantidad * precio * fm) / fm;
    if (Math.abs(importeCalculado - importeEtiqueta) >= 1 / fm) aviso = { importeEtiqueta, importeCalculado };
  }

  const pesaje: PesajeEtiqueta = {
    origen: 'etiqueta',
    neto: v.cantidad,
    unidad: codigoUnidad(producto.unit_code) || 'KG',
    estable: true,
    codigo_etiqueta: etiqueta.codigo,
    leido_en: (params.ahora ?? new Date()).toISOString(),
    ...(importeEtiqueta !== null ? { importe_etiqueta: importeEtiqueta } : {}),
  };
  return { ok: true, cantidad: v.cantidad, pesaje, aviso };
}

// ── Lectura del formato guardado ──────────────────────────────────────────

/** Fila de `organization_barcode_settings` (solo las columnas de etiqueta). */
export interface FilaFormatoEtiqueta {
  weight_label_enabled?: boolean | null;
  weight_label_prefixes?: readonly string[] | null;
  weight_label_content?: string | null;
  weight_label_plu_digits?: number | null;
  weight_label_value_digits?: number | null;
  weight_label_value_check?: boolean | null;
}

/** Formato desde la fila guardada; `null` si la organización no tiene etiquetas de peso activas. */
export function formatoDesdeFila(fila: FilaFormatoEtiqueta | null | undefined): FormatoEtiquetaPeso | null {
  if (!fila || fila.weight_label_enabled !== true) return null;
  const formato: FormatoEtiquetaPeso = {
    activo: true,
    prefijos: (fila.weight_label_prefixes ?? []).map((p) => String(p).trim()).filter(Boolean),
    contenido: fila.weight_label_content === 'price' ? 'price' : 'weight',
    digitosPlu: Number(fila.weight_label_plu_digits ?? 5),
    digitosValor: Number(fila.weight_label_value_digits ?? 5),
    digitoControlValor: fila.weight_label_value_check === true,
  };
  return formatoEtiquetaValido(formato) && formato.prefijos.length > 0 ? formato : null;
}

// ── «Exportar PLU» para cargar la balanza ─────────────────────────────────

/** Una fila de `fn_productos_exportar_plu`. */
export interface FilaPlu {
  plu: number;
  productId: number;
  nombre: string;
  /** Precio vigente por la unidad de venta (por kg); `null` si no tiene. */
  precioPorUnidad: number | null;
  unidad: string;
  tara: number | null;
  diasVida: number | null;
}

function celdaCsv(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function numeroCsv(n: number | null, decimales: number): string {
  if (n === null || !Number.isFinite(n)) return '';
  // Separador «;» y coma decimal: lo que abre bien una hoja de cálculo en español.
  return String(Number(n.toFixed(decimales))).replace('.', ',');
}

/**
 * CSV «PLU; nombre; precio por kg; tara; días de vida» (una fila por producto,
 * ordenado por PLU) para cargar la balanza con su software. `encabezados`
 * llega traducido. Precio con los decimales de la moneda; tara en la unidad
 * del producto con 3 decimales. BOM al inicio para que las tildes abran bien.
 */
export function csvExportarPlu(
  filas: readonly FilaPlu[],
  encabezados: readonly [string, string, string, string, string],
  decimalesMoneda = 0,
): string {
  const lineas = [encabezados.map(celdaCsv).join(';')];
  for (const f of [...filas].sort((a, b) => a.plu - b.plu)) {
    lineas.push(
      [
        String(f.plu),
        celdaCsv(f.nombre ?? ''),
        numeroCsv(f.precioPorUnidad, Math.max(0, decimalesMoneda)),
        numeroCsv(f.tara, 3),
        f.diasVida === null ? '' : String(f.diasVida),
      ].join(';'),
    );
  }
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}
