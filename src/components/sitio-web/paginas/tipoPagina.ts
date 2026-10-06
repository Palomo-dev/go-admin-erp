/**
 * Tipo de una página del sitio para mostrarla en Páginas (Figma A/04a): la
 * etiqueta («Inicio (una página)», «Carta», «Legal»…) y su icono, a partir de
 * `pagina.tipo` o, en las páginas `builtin` importadas del sitio actual, de su
 * dirección. Puro: lo usan la lista, el diálogo «Nueva página», el menú y el
 * servidor (para excluir plantillas y separar las legales).
 */

export type ClaveTipoPagina =
  | 'inicio'
  | 'carta'
  | 'carta_qr'
  | 'reservas'
  | 'eventos'
  | 'nosotros'
  | 'contacto'
  | 'sedes'
  | 'legal'
  | 'galeria'
  | 'servicios'
  | 'espacios'
  | 'productos'
  | 'categorias'
  | 'ofertas'
  | 'domicilios'
  | 'consultar_pedido'
  | 'membresias'
  | 'personalizada';

/** Lo mínimo de una página para decidir su tipo (V2 o legacy). */
export interface PaginaTipificable {
  tipo: string;
  slug: string;
}

/**
 * Plantillas de detalle que se gestionan en Tienda y NO se listan en Páginas
 * (A/04i nota 2): son las 7 `page_type` de detalle del constructor actual.
 */
export const TIPOS_PLANTILLA_TIENDA: readonly string[] = [
  'product_detail',
  'category_detail',
  'cart',
  'checkout',
  'order_confirmation',
  'space_detail',
  'account',
];

/** Direcciones de las políticas que hoy genera Configuración › Legales (o el sitio importado). */
const SLUGS_LEGALES = new Set([
  'terminos',
  'terminos-y-condiciones',
  'privacidad',
  'politica-de-privacidad',
  'politica-privacidad',
  'cambios-y-devoluciones',
  'devoluciones',
  'envios',
  'politica-de-envios',
  'cookies',
  'politica-de-cookies',
  'tratamiento-de-datos',
]);

/** Por tipo explícito (páginas creadas en V2 o con `page_type` propio). */
const POR_TIPO: Record<string, ClaveTipoPagina> = {
  home: 'inicio',
  inicio: 'inicio',
  carta: 'carta',
  menu: 'carta',
  carta_qr: 'carta_qr',
  reservas: 'reservas',
  eventos: 'eventos',
  nosotros: 'nosotros',
  contacto: 'contacto',
  sedes: 'sedes',
  legal: 'legal',
  policy: 'legal',
  galeria: 'galeria',
  servicios: 'servicios',
  productos: 'productos',
  membresias: 'membresias',
};

/** Por dirección (páginas `builtin` y `custom` importadas). */
const POR_SLUG: Record<string, ClaveTipoPagina> = {
  '': 'inicio',
  home: 'inicio',
  inicio: 'inicio',
  menu: 'carta',
  carta: 'carta',
  'carta-qr': 'carta_qr',
  'reservas-mesa': 'reservas',
  reservas: 'reservas',
  eventos: 'eventos',
  nosotros: 'nosotros',
  contacto: 'contacto',
  sedes: 'sedes',
  galeria: 'galeria',
  servicios: 'servicios',
  espacios: 'espacios',
  productos: 'productos',
  categorias: 'categorias',
  ofertas: 'ofertas',
  domicilios: 'domicilios',
  'consultar-pedido': 'consultar_pedido',
  membresias: 'membresias',
  pases: 'membresias',
};

export function esPlantillaTienda(p: PaginaTipificable): boolean {
  return TIPOS_PLANTILLA_TIENDA.includes(p.tipo) || p.slug.startsWith('plantillas/');
}

export function esPaginaLegal(p: PaginaTipificable): boolean {
  return p.tipo === 'legal' || p.tipo === 'policy' || SLUGS_LEGALES.has(p.slug) || p.slug.startsWith('politica-');
}

export function claveTipoPagina(p: PaginaTipificable): ClaveTipoPagina {
  if (esPaginaLegal(p)) return 'legal';
  const porTipo = POR_TIPO[p.tipo];
  if (porTipo) return porTipo;
  return POR_SLUG[p.slug] ?? 'personalizada';
}

export function esInicio(p: PaginaTipificable): boolean {
  return claveTipoPagina(p) === 'inicio';
}
