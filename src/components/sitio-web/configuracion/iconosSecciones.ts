/**
 * Iconos de Configuración del sitio y de la Carta, en un solo lugar. Puro: sin
 * React, lo prueban los tests.
 *
 * Petición del dueño (2026-10-06): «los iconos los entiende más fácil
 * cualquier usuario». Por eso cada sección de Configuración lleva el MISMO
 * icono en el índice lateral (16 px), en el título de su tarjeta (caja de 32
 * con icono de 16) y en la fila móvil (20 px, Figma B/12-03). Ninguna de las
 * tres pantallas elige su icono: importan de aquí. Los tamaños salen de la
 * escala única del módulo (`ui/iconosSitio.ts`).
 *
 * El icono acompaña al texto, nunca lo sustituye (`aria-hidden`), y el color
 * sale del dato: la Zona de peligro es la única sección en rojo.
 */
import {
  AlertTriangle,
  CalendarClock,
  Moon,
  PauseCircle,
  CalendarDays,
  Eye,
  FileText,
  Globe,
  Hash,
  LayoutList,
  Layers,
  MapPin,
  MessageSquare,
  Pencil,
  Sparkles,
  Store,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { TonoTarjeta } from '@/components/kit/tonosKit';
import type { EstadoLegal, SeccionConfiguracion } from '@/lib/website/configuracionSitio';
import { ICONO_ESTADO_PUBLICACION } from '../ui/iconosSitio';

/**
 * Una sección, un icono (B/12-03). «Código y píxeles» usa `#` como la captura
 * móvil, no el `</>` que tenía antes el código.
 */
export const ICONOS_SECCION_CONFIGURACION: Record<SeccionConfiguracion, LucideIcon> = {
  datos: Store,
  legales: FileText,
  codigo: Hash,
  chat: MessageSquare,
  idioma: Globe,
  mantenimiento: Wrench,
  peligro: Trash2,
};

/** Tono del icono de cada sección: solo la Zona de peligro cambia de color. */
export function tonoIconoSeccion(seccion: SeccionConfiguracion): TonoTarjeta {
  return seccion === 'peligro' ? 'peligro' : 'neutro';
}

/** Clase de color del icono suelto (índice y fila móvil). */
export function claseColorIconoSeccion(seccion: SeccionConfiguracion): string {
  return seccion === 'peligro' ? 'text-danger-text' : 'text-fg-secondary';
}

/**
 * Icono de cada estado de un documento legal (B/12-01): el color nunca va
 * solo. Publicado y Borrador repiten el icono del estado de publicación del
 * sitio (check y lápiz) para que se lea igual en todo el módulo; Falta usa el
 * triángulo de «algo falló».
 */
export const ICONO_ESTADO_LEGAL: Record<EstadoLegal, LucideIcon> = {
  publicado: ICONO_ESTADO_PUBLICACION.publicado,
  borrador: ICONO_ESTADO_PUBLICACION.borrador,
  falta: AlertTriangle,
};

/** Icono de la acción de cada documento legal según su estado. */
export const ICONO_ACCION_LEGAL: Record<EstadoLegal, LucideIcon> = {
  publicado: Pencil, // «Editar»
  borrador: Eye, // «Revisar y publicar»
  falta: Sparkles, // «Generar con asistente»
};

/** Pestañas del detalle de una carta (F-flujos/1b). */
export type PestanaCarta = 'contenido' | 'horario' | 'sede' | 'variantes';

export const ICONO_PESTANA_CARTA: Record<PestanaCarta, LucideIcon> = {
  contenido: LayoutList,
  horario: CalendarDays,
  sede: MapPin,
  variantes: Layers,
};

/**
 * Estado de una carta en la lista y el detalle (B/13-01): los tres llevan
 * icono, para leerlos sin leer el texto. «Visible ahora» usa el mismo check de
 * «Publicado» (ICONO_ESTADO_PUBLICACION): está en el aire.
 */
export type EstadoCartaIcono = 'visible' | 'fueraDeHorario' | 'inactiva';
export const ICONO_ESTADO_CARTA: Record<EstadoCartaIcono, LucideIcon> = {
  visible: ICONO_ESTADO_PUBLICACION.publicado,
  fueraDeHorario: Moon,
  inactiva: PauseCircle,
};

/** Reservas web: es POS › Reservas de mesas › Configuración (P12 nota 1); desde aquí solo se enlaza. */
export const ICONO_RESERVAS_WEB: LucideIcon = CalendarClock;
