/**
 * `CartLine` sin React: qué texto de impuesto va según el modo, qué controles
 * quedan deshabilitados, cuándo se ofrece «+ Agregar descuento» y cómo se lee
 * el campo de cantidad. **No calcula importes**: la línea recibe el total, el
 * precio unitario y el impuesto ya calculados por el servicio y `TaxSummary`
 * (POS-PLAN L25; la semántica de «Excluir impuesto» e «Incluido» no se toca).
 */

/**
 * Cómo entra el impuesto en la línea:
 * - `encima`: se suma al precio («+$X impuestos»).
 * - `incluido`: ya está en el precio («inc. $X impuestos»).
 * - `excluido`: el cajero lo excluyó en esta venta («Sin impuesto»).
 * - `sinAsignar`: el producto no tiene impuesto configurado («Sin impuesto asignado», C-21).
 */
export type ModoImpuestoLinea = 'encima' | 'incluido' | 'excluido' | 'sinAsignar';

export interface ImpuestoLinea {
  modo: ModoImpuestoLinea;
  /** Importe del impuesto de la línea, ya calculado. */
  importe?: number | null;
}

export type ClaveTextoImpuesto = 'impuestoEncima' | 'impuestoIncluido' | 'sinImpuesto' | 'sinImpuestoAsignado';

export interface TextoImpuestoLinea {
  /** Clave de `kit.carrito`. */
  clave: ClaveTextoImpuesto;
  /** Importe a formatear (solo `encima` e `incluido`). */
  importe?: number;
  tono: 'exito' | 'advertencia' | 'neutro';
}

/**
 * Texto del bloque de importe. `encima` e `incluido` sin importe (0 o nulo) no
 * dicen nada, igual que hoy (`CartView`: solo con `tax_amount > 0`).
 */
export function textoImpuestoLinea(impuesto: ImpuestoLinea | null | undefined): TextoImpuestoLinea | null {
  if (!impuesto) return null;
  const importe = Number(impuesto.importe ?? 0);
  switch (impuesto.modo) {
    case 'excluido':
      return { clave: 'sinImpuesto', tono: 'advertencia' };
    case 'sinAsignar':
      return { clave: 'sinImpuestoAsignado', tono: 'neutro' };
    case 'incluido':
      return importe > 0 ? { clave: 'impuestoIncluido', importe, tono: 'exito' } : null;
    default:
      return importe > 0 ? { clave: 'impuestoEncima', importe, tono: 'exito' } : null;
  }
}

export interface EstadoControlesLinea {
  /** − · campo · + */
  cantidad: boolean;
  /** Casilla «Incluido». */
  incluido: boolean;
  /** Nota, excluir impuesto, quitar y etiquetas editables. */
  acciones: boolean;
}

/**
 * Qué queda deshabilitado (`true` = deshabilitado). Bloqueada (en espera o con
 * deuda) apaga todo; con el impuesto excluido la casilla «Incluido» no aplica
 * (como hoy: `disabled={isOnHold || item.tax_excluded}`).
 */
export function controlesDeshabilitados({
  bloqueada,
  modoImpuesto,
  incluidoDeshabilitado,
}: {
  bloqueada?: boolean;
  modoImpuesto?: ModoImpuestoLinea;
  incluidoDeshabilitado?: boolean;
}): EstadoControlesLinea {
  const b = !!bloqueada;
  return {
    cantidad: b,
    incluido: b || modoImpuesto === 'excluido' || !!incluidoDeshabilitado,
    acciones: b,
  };
}

/** «+ Agregar descuento · D»: sin descuento, con callback, sin bloquear y sin el editor abierto. */
export function mostrarAgregarDescuento({
  conDescuento,
  bloqueada,
  editandoDescuento,
  hayAccion,
}: {
  conDescuento?: boolean;
  bloqueada?: boolean;
  editandoDescuento?: boolean;
  hayAccion: boolean;
}): boolean {
  return hayAccion && !conDescuento && !bloqueada && !editandoDescuento;
}

/**
 * Cantidad escrita en el campo: entero mayor que 0 o `null` (el campo no acepta
 * ≤ 0 ni vacío; como hoy, `parseInt`). Bajar a 0 solo se hace con «−», y la
 * pantalla decide si confirma.
 */
export function cantidadDesdeTexto(texto: string): number | null {
  const n = Number.parseInt(texto.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** En móvil, ¿hace falta el tercer renglón? Solo si hay etiquetas, el enlace de descuento o un editor. */
export function hayRenglonEtiquetas({
  etiquetas,
  agregarDescuento,
  excluido,
  editor,
}: {
  etiquetas: number;
  agregarDescuento: boolean;
  excluido: boolean;
  editor: boolean;
}): boolean {
  return etiquetas > 0 || agregarDescuento || excluido || editor;
}

/** Atajos de la línea con foco (POS-UX-V2 §3). Los registra la pantalla con `useAtajos`; aquí solo se anuncian. */
export const ATAJOS_LINEA = {
  menos: '-',
  mas: '+',
  descuento: 'D',
  nota: 'N',
  excluirImpuesto: 'T',
  quitar: 'Supr',
} as const;

export type AccionLinea = keyof typeof ATAJOS_LINEA;
