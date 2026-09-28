/**
 * Acciones de fila, de tarjeta y de la barra masiva (PATRONES-TRANSVERSALES.md
 * §6 y §11): un icono lucide por acción, lo destructivo al final tras un
 * divisor y en rojo, como mucho 8 entradas por menú.
 */
import type { LucideIcon } from 'lucide-react';

export interface AccionFila {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
  onSelect: () => void;
  /**
   * Segunda línea atenuada bajo la etiqueta (menú «Importar ▾»: «CSV o Excel ·
   * plantilla de 26 columnas»). Solo en menús de cabecera, no en filas.
   */
  descripcion?: string;
  /** Rojo, al final y tras un divisor. Debe abrir un ConfirmDialog. */
  destructiva?: boolean;
  /** Divisor antes de esta acción (para agrupar las del dominio). */
  separadorAntes?: boolean;
  deshabilitada?: boolean;
  /**
   * Por qué está deshabilitada. Nunca un botón deshabilitado sin explicación:
   * si no aplica y no hay motivo que mostrar, mejor `oculta`.
   */
  motivo?: string;
  oculta?: boolean;
}

export type EntradaMenu = { tipo: 'accion'; accion: AccionFila } | { tipo: 'separador'; id: string };

export const MAX_ENTRADAS_MENU = 8;

/**
 * Ordena y separa: las no destructivas en su orden, luego un divisor y las
 * destructivas. Sin divisores al principio, al final ni dobles.
 */
export function prepararMenu(acciones: readonly AccionFila[]): EntradaMenu[] {
  const visibles = acciones.filter((a) => !a.oculta);
  const normales = visibles.filter((a) => !a.destructiva);
  const destructivas = visibles.filter((a) => a.destructiva);

  const salida: EntradaMenu[] = [];
  const agregarSeparador = (id: string) => {
    const ultima = salida[salida.length - 1];
    if (ultima && ultima.tipo !== 'separador') salida.push({ tipo: 'separador', id });
  };

  for (const accion of normales) {
    if (accion.separadorAntes) agregarSeparador(`sep-${accion.id}`);
    salida.push({ tipo: 'accion', accion });
  }
  if (destructivas.length) agregarSeparador('sep-destructivas');
  for (const accion of destructivas) salida.push({ tipo: 'accion', accion });
  return salida;
}

export function contarAcciones(entradas: readonly EntradaMenu[]): number {
  return entradas.filter((e) => e.tipo === 'accion').length;
}
