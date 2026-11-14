/**
 * Pestañas-enlace del diálogo de Configuración (Figma pág. 10, 12.9;
 * pantallazo 94-config-04; aprobado por el dueño el 2026-11-14).
 *
 * En Integraciones, «Catálogo», «Mis conexiones» y «Actividad» no son
 * ajustes: son pestañas de la página Conexiones del módulo. En el diálogo se
 * ven junto a las secciones reales («General», «Desarrolladores») pero
 * navegan: cierran el diálogo (preguntando si hay cambios sin guardar) y
 * abren la página.
 *
 * Cuelgan de la entrada del menú: si el plan no incluye el módulo, el servidor
 * no devuelve sus secciones, la entrada no existe y los enlaces no se pintan.
 * Los valores de `?tab=` salen de las constantes de la propia página.
 */
import { rutaPestanaConexiones, type Pestana } from '@/components/integraciones/conexiones-v2/filtrosConexiones';

export interface EnlacePestana {
  /** Clave i18n en `configuracionDialogo.enlacesPestana.<clave>`. */
  clave: string;
  href: string;
}

const pestanaConexiones = (p: Pestana): EnlacePestana => ({ clave: `integraciones_${p}`, href: rutaPestanaConexiones(p) });

/** Por id de entrada del menú (`EntradaMenu.id`), en el orden del diseño; van antes de las secciones. */
export const ENLACES_PESTANA: Readonly<Record<string, readonly EnlacePestana[]>> = {
  integraciones: [pestanaConexiones('catalogo'), pestanaConexiones('mis'), pestanaConexiones('actividad')],
};

export function enlacesDeEntrada(entradaId: string): readonly EnlacePestana[] {
  return ENLACES_PESTANA[entradaId] ?? [];
}
