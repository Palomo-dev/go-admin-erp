'use client';

import type { ReactNode } from 'react';
import { ExternalLink, FileText, ListCheck, ListX, MessageCircle, Phone, Tag, type LucideIcon } from 'lucide-react';
import type { AccionFila, PropsNodoArrastre } from '@/components/kit';
import { SortableRow } from './SortableRow';

/**
 * Enlace de un menú del sitio (Figma D/02 MenuLinkRow; Páginas › Menú y el
 * constructor de menús del editor, D/05-20): asa, icono del tipo, nombre,
 * detalle («Megamenú · categorías del inventario»), control «en el menú» y «⋯».
 * Es una `SortableRow` con el icono que corresponde al tipo de enlace; los
 * submenús se sangran con `nivel`.
 */
export type TipoEnlaceMenu = 'pagina' | 'categoria' | 'externo' | 'whatsapp' | 'telefono';

/**
 * Icono de cada tipo de enlace: la ÚNICA tabla del módulo. La usan esta fila,
 * el formulario «Nuevo menú», la columna de categorías del inventario y el
 * inspector, para que «categoría» se vea igual en todas partes (etiqueta de
 * precio, como en Figma D/04-09).
 */
export const ICONO_TIPO_ENLACE_MENU: Record<TipoEnlaceMenu, LucideIcon> = {
  pagina: FileText,
  categoria: Tag,
  externo: ExternalLink,
  whatsapp: MessageCircle,
  telefono: Phone,
};

/**
 * Visibilidad EN EL MENÚ (no en el sitio): lista con check = está en el menú;
 * lista con X = fuera del menú, la página sigue publicada. No es el ojo
 * tachado, que en el módulo significa «Sin publicar» (ICONO_ESTADO_PUBLICACION).
 */
export const ICONOS_VISIBILIDAD_MENU = { visible: ListCheck, oculta: ListX } as const;

export interface MenuLinkRowProps {
  etiqueta: string;
  tipo: TipoEnlaceMenu;
  /** Icono propio (p. ej. el de la categoría del inventario); por defecto el del tipo. */
  icono?: LucideIcon;
  detalle?: ReactNode;
  nivel?: number;
  seleccionada?: boolean;
  oculta?: boolean;
  onSeleccionar?: () => void;
  onAlternarVisible?: () => void;
  acciones?: readonly AccionFila[];
  arrastre?: PropsNodoArrastre;
  onMover?: (direccion: -1 | 1) => void;
  className?: string;
}

export function MenuLinkRow({ tipo, icono, ...resto }: MenuLinkRowProps) {
  return <SortableRow icono={icono ?? ICONO_TIPO_ENLACE_MENU[tipo]} iconosVisibilidad={ICONOS_VISIBILIDAD_MENU} {...resto} />;
}
