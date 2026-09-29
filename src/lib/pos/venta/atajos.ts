/**
 * Mapa canónico de atajos del POS (docs/design/POS-UX-V2.md §3, D2): una sola
 * lista que usan la pantalla, el carrito, el cobro y la post-venta para
 * registrar sus acciones con `useAtajos`, y el diálogo F1 (`MapaAtajos`) para
 * dibujarse. Si un atajo cambia, cambia aquí y en todos los sitios.
 *
 * Evita F3, F5, F11, F12 y Ctrl+letra del navegador (salvo Ctrl+N, que el
 * POS captura con `preventDefault` como hace el mapa de diseño).
 *
 * Sin React. Las descripciones son claves de `posVenta.atajos.<id>`.
 */

export type GrupoAtajoPos = 'venta' | 'carrito' | 'linea' | 'cobro' | 'postVenta';

export interface DefinicionAtajoPos {
  id: IdAtajoPos;
  /** Como se escribe en pantalla y en `Kbd` («F9», «Ctrl+N», «Alt+1»). */
  tecla: string;
  grupo: GrupoAtajoPos;
  /**
   * Solo informativo en el mapa (no se registra con `useAtajos`): lo maneja el
   * propio control (el buscador con «/», el grid con ↑↓ Enter, el lector).
   */
  soloMapa?: boolean;
}

export const ATAJOS_POS = [
  // Pantalla de venta
  { id: 'buscar', tecla: '/', grupo: 'venta', soloMapa: true },
  { id: 'limpiarBuscador', tecla: 'Esc', grupo: 'venta', soloMapa: true },
  { id: 'moverGrid', tecla: '↑↓', grupo: 'venta', soloMapa: true },
  { id: 'agregarConFoco', tecla: 'Enter', grupo: 'venta', soloMapa: true },
  { id: 'cantidadRapida', tecla: '3*', grupo: 'venta', soloMapa: true },
  { id: 'mapa', tecla: 'F1', grupo: 'venta' },
  { id: 'cliente', tecla: 'F2', grupo: 'venta' },
  { id: 'caja', tecla: 'F9', grupo: 'venta' },
  { id: 'pantallaCliente', tecla: 'F10', grupo: 'venta' },
  { id: 'nuevoCarrito', tecla: 'Ctrl+N', grupo: 'venta' },
  { id: 'siguienteCarrito', tecla: 'Ctrl+Tab', grupo: 'venta' },
  { id: 'codigoManual', tecla: 'Ctrl+B', grupo: 'venta' },
  // Carrito
  { id: 'cobrar', tecla: 'F4', grupo: 'carrito' },
  { id: 'espera', tecla: 'F6', grupo: 'carrito' },
  { id: 'deuda', tecla: 'F7', grupo: 'carrito' },
  { id: 'cocina', tecla: 'F8', grupo: 'carrito' },
  // Línea con foco
  { id: 'lineaMas', tecla: '+', grupo: 'linea' },
  { id: 'lineaMenos', tecla: '-', grupo: 'linea' },
  { id: 'lineaDescuento', tecla: 'D', grupo: 'linea' },
  { id: 'lineaNota', tecla: 'N', grupo: 'linea' },
  { id: 'lineaImpuesto', tecla: 'T', grupo: 'linea' },
  { id: 'lineaQuitar', tecla: 'Supr', grupo: 'linea' },
  // Línea por peso o medida: reabre «Pesar» para cambiar el peso (PRODUCTOS-POR-PESO-BASCULA.md).
  { id: 'lineaPeso', tecla: 'P', grupo: 'linea' },
  // Cobro
  { id: 'metodo1', tecla: 'Alt+1', grupo: 'cobro' },
  { id: 'metodo2', tecla: 'Alt+2', grupo: 'cobro' },
  { id: 'metodo3', tecla: 'Alt+3', grupo: 'cobro' },
  { id: 'metodo4', tecla: 'Alt+4', grupo: 'cobro' },
  { id: 'metodoOtro', tecla: 'Alt+5', grupo: 'cobro' },
  { id: 'exacto', tecla: 'Alt+E', grupo: 'cobro' },
  { id: 'propina', tecla: 'Alt+P', grupo: 'cobro' },
  { id: 'entrega', tecla: 'Alt+D', grupo: 'cobro' },
  { id: 'facturaElectronica', tecla: 'Alt+F', grupo: 'cobro' },
  { id: 'completarVenta', tecla: 'Enter', grupo: 'cobro' },
  { id: 'cancelarCobro', tecla: 'Esc', grupo: 'cobro' },
  // Post-venta
  { id: 'nuevaVenta', tecla: 'Enter', grupo: 'postVenta' },
  { id: 'reimprimir', tecla: 'P', grupo: 'postVenta' },
  { id: 'factura', tecla: 'F', grupo: 'postVenta' },
  { id: 'cerrarPostVenta', tecla: 'Esc', grupo: 'postVenta' },
] as const satisfies readonly { id: string; tecla: string; grupo: GrupoAtajoPos; soloMapa?: boolean }[];

export type IdAtajoPos = (typeof ATAJOS_POS)[number]['id'];

const POR_ID = new Map<string, DefinicionAtajoPos>(ATAJOS_POS.map((a) => [a.id, a as DefinicionAtajoPos]));

/** La tecla de un atajo del mapa («F4»). */
export function teclaAtajo(id: IdAtajoPos): string {
  return POR_ID.get(id)!.tecla;
}

/** Orden de los grupos en el mapa F1. */
export const GRUPOS_ATAJOS_POS: readonly GrupoAtajoPos[] = ['venta', 'carrito', 'linea', 'cobro', 'postVenta'];

/** Atajos del mapa agrupados, en el orden canónico. */
export function atajosPorGrupo(): { grupo: GrupoAtajoPos; atajos: DefinicionAtajoPos[] }[] {
  return GRUPOS_ATAJOS_POS.map((grupo) => ({
    grupo,
    atajos: ATAJOS_POS.filter((a) => a.grupo === grupo) as DefinicionAtajoPos[],
  }));
}

/** Teclas que el navegador reserva y el POS no debe usar (POS-UX-V2 §3). */
export const TECLAS_RESERVADAS_NAVEGADOR = ['F3', 'F5', 'F11', 'F12', 'Ctrl+T', 'Ctrl+W', 'Ctrl+R', 'Ctrl+L', 'Ctrl+P', 'Ctrl+F'] as const;
