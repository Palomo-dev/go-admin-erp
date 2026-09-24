/** `ViewToggle` sin React: las dos vistas y a cuál lleva el botón que alterna en móvil. */
import type { LucideIcon } from 'lucide-react';

export interface OpcionVista<V extends string> {
  valor: V;
  etiqueta: string;
  icono: LucideIcon;
}

/** La vista a la que lleva el botón que alterna (la que no está activa). */
export function otraVista<V extends string>(opciones: readonly [OpcionVista<V>, OpcionVista<V>], valor: V): OpcionVista<V> {
  return opciones[0].valor === valor ? opciones[1] : opciones[0];
}
