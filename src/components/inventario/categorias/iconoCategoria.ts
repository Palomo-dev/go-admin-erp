import * as LucideIcons from 'lucide-react';
import { Tags, type LucideIcon } from 'lucide-react';
import { STATION_LABELS, type PrinterStation } from '@/components/pos/configuracion/printersService';

/**
 * Icono propio de la categoría (`categories.icon`, nombre de lucide que elige
 * el `IconSelector`). Si no hay o el nombre no existe, el de la entidad
 * Categoría del catálogo de iconos: `Tags`.
 */
export function iconoCategoria(nombre: string | null | undefined): LucideIcon {
  if (!nombre) return Tags;
  const candidato = (LucideIcons as unknown as Record<string, unknown>)[nombre];
  // Los componentes de lucide son objetos forwardRef (typeof 'object') con render.
  if (candidato && (typeof candidato === 'function' || typeof candidato === 'object')) {
    return candidato as LucideIcon;
  }
  return Tags;
}

/** Etiqueta legible de `categories.station`; nunca el valor crudo (`hot_kitchen`). */
export function etiquetaEstacion(station: string | null | undefined): string {
  if (!station) return 'Sin estación';
  return STATION_LABELS[station as PrinterStation] ?? station;
}

export const OPCIONES_ESTACION = Object.entries(STATION_LABELS).map(([valor, etiqueta]) => ({
  valor: valor as PrinterStation,
  etiqueta,
}));

/** Rutas de la pantalla, en un solo sitio. */
export const RUTAS_CATEGORIAS = {
  listado: '/app/inventario/categorias',
  nueva: (padreId?: number | null) =>
    padreId ? `/app/inventario/categorias/nuevo?parent=${padreId}` : '/app/inventario/categorias/nuevo',
  detalle: (uuid: string) => `/app/inventario/categorias/${uuid}`,
  editar: (uuid: string) => `/app/inventario/categorias/${uuid}/editar`,
  /** Catálogo filtrado por la categoría (el catálogo debe leer `?categoria=`). */
  productos: (id: number) => `/app/inventario/productos?categoria=${id}`,
  catalogo: '/app/inventario/productos',
  promociones: '/app/pos/promociones',
  tiendaWeb: '/app/organizacion/branding',
} as const;
