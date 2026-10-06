/**
 * Enlaces a otros módulos desde Configuración y Carta. Las rutas salen del
 * catálogo de navegación (`moduloPorCodigo`): si el módulo o la página no
 * existen en el catálogo, el enlace no se pinta. Nada cableado fuera de aquí.
 */
import { moduloPorCodigo } from '@/lib/navigation/catalog';

/** La ruta de una página del catálogo, si existe (`/app/chat/canales`). */
export function rutaCatalogo(codigoModulo: string, href: string): string | null {
  const modulo = moduloPorCodigo(codigoModulo);
  return modulo?.paginas.some((p) => p.href === href) ? href : null;
}

export const enlacesConfiguracion = {
  sucursales: () => rutaCatalogo('organizations', '/app/organizacion/sucursales'),
  informacion: () => rutaCatalogo('organizations', '/app/organizacion/informacion'),
  chat: () => rutaCatalogo('chat', '/app/chat/canales'),
  analitica: () => rutaCatalogo('website', '/app/sitio-web/analitica'),
  mesas: () => rutaCatalogo('pos', '/app/pos/mesas'),
  etiquetas: () => rutaCatalogo('inventory', '/app/inventario/etiquetas'),
  productos: () => rutaCatalogo('inventory', '/app/inventario/productos'),
  /** Ficha de un producto en Inventario (`/app/inventario/productos/[id]`). */
  producto: (id: number) => (rutaCatalogo('inventory', '/app/inventario/productos') ? `/app/inventario/productos/${id}` : null),
  /** Reservas web: POS › Reservas de mesas › Configuración (P12 nota 1: no se duplica el formulario). */
  reservas: () => {
    const base = rutaCatalogo('pos', '/app/pos/reservas-mesas');
    return base ? `${base}?tab=configuracion` : null;
  },
  dominios: () => rutaCatalogo('website', '/app/sitio-web/dominios'),
};
