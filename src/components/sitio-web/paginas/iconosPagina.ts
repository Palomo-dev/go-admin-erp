/**
 * Iconos del área Páginas, en un solo lugar (lucide 1,5; tamaños de
 * `ui/iconosSitio.ts`). Separado de `tipoPagina.ts` y `saludSeo.ts` para que el
 * servidor no cargue React.
 *
 * - Tipo de página (A/04a, columna «Página»; tarjetas móviles A/04h).
 * - Salud SEO (A/04a, columna «SEO»): el icono dice QUÉ falta (título, texto,
 *   imagen) y el tono, que hay que revisarlo. Lo puede usar «Calidad SEO por
 *   página» (B/08) con la misma regla `saludSeo`.
 * - Zonas del menú (A/04c): encabezado, pie y categorías del inventario.
 */
import {
  AlignLeft,
  BookOpen,
  CircleDashed,
  Contact,
  Columns3,
  ImageOff,
  PanelBottom,
  PanelTop,
  Type,
  CalendarCheck,
  CalendarDays,
  Dumbbell,
  FileText,
  Home,
  Images,
  LayoutGrid,
  MapPin,
  Package,
  Percent,
  QrCode,
  Search,
  SearchCheck,
  ShieldCheck,
  Truck,
  UtensilsCrossed,
  BedDouble,
  Briefcase,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ICONO_TIPO_ENLACE_MENU } from '@/components/sitio-web/ui/MenuLinkRow';
import type { ItemMenu, PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { tipoEnlace } from './operacionesMenu';
import type { SaludSeo } from './saludSeo';
import { claveTipoPagina, type ClaveTipoPagina, type PaginaTipificable } from './tipoPagina';

export const ICONO_TIPO_PAGINA: Record<ClaveTipoPagina, LucideIcon> = {
  inicio: Home,
  carta: UtensilsCrossed,
  carta_qr: QrCode,
  reservas: CalendarCheck,
  eventos: CalendarDays,
  nosotros: Users,
  // Tarjeta de contacto y no teléfono: el auricular es del enlace «Teléfono»
  // (ICONO_TIPO_ENLACE_MENU) y los dos conviven en el mismo árbol del menú.
  contacto: Contact,
  sedes: MapPin,
  legal: ShieldCheck,
  galeria: Images,
  servicios: Briefcase,
  espacios: BedDouble,
  productos: Package,
  categorias: LayoutGrid,
  ofertas: Percent,
  domicilios: Truck,
  consultar_pedido: Search,
  membresias: Dumbbell,
  personalizada: FileText,
};

/** Icono para enlaces de menú a una página (mismo criterio que la lista). */
export function iconoDePagina(p: PaginaTipificable | undefined): LucideIcon {
  return p ? ICONO_TIPO_PAGINA[claveTipoPagina(p)] : BookOpen;
}

/**
 * Icono de la salud SEO de una página (acompaña al texto de la insignia, nunca lo sustituye).
 * «Completo» es la lupa con check y no el check solo: en la misma fila de A/04a
 * «Publicado» ya lleva Check (ICONO_ESTADO_PUBLICACION) y las dos píldoras verdes
 * no pueden verse iguales diciendo cosas distintas.
 */
export const ICONO_SALUD_SEO: Record<SaludSeo, LucideIcon> = {
  completo: SearchCheck,
  falta_titulo: Type,
  falta_descripcion: AlignLeft,
  falta_imagen: ImageOff,
  sin_revisar: CircleDashed,
};

/**
 * Zonas de Menú y navegación (A/04c, D/04-09, D/04-10): títulos de columna y la
 * insignia de ubicación de cada menú con nombre. «Sin ubicación» usa el mismo
 * círculo punteado que «Sin revisar»: algo que aún no está puesto.
 */
export const ICONO_ZONA_MENU = {
  encabezado: PanelTop,
  megamenu: Columns3,
  pie: PanelBottom,
  sin: CircleDashed,
  categorias: ICONO_TIPO_ENLACE_MENU.categoria,
} as const satisfies Record<string, LucideIcon>;

/**
 * Icono de un enlace del menú: si lleva a una página, el de su tipo (Carta =
 * cubiertos); si no, el de su tipo de enlace. Lo usan el árbol y el inspector,
 * para que la fila elegida y su panel muestren el mismo icono.
 */
export function iconoDeItem(item: ItemMenu, paginas: ReadonlyMap<string, PaginaSitio>): LucideIcon {
  if (item.tipo === 'page') return iconoDePagina(paginas.get(item.paginaId));
  return ICONO_TIPO_ENLACE_MENU[tipoEnlace(item)];
}
