/**
 * Icono (lucide, trazo 1,5) y miniatura esquemática de cada tipo de sección, a partir del
 * catálogo del editor (`getSectionDefinition(tipo).icon`). Sin lista de tipos cableada: el
 * icono sale del catálogo y aquí solo se traduce el NOMBRE de lucide a su componente.
 */
import {
  Award,
  BadgeCheck,
  BedDouble,
  Bike,
  CalendarCheck,
  CalendarDays,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  CreditCard,
  Dumbbell,
  FileText,
  Filter,
  Flame,
  FolderOpen,
  FolderTree,
  Gauge,
  Handshake,
  HelpCircle,
  Image,
  Images,
  LayoutGrid,
  LayoutPanelLeft,
  List,
  ListChecks,
  Mail,
  Map as IconoMapa,
  MapPin,
  Megaphone,
  MessageSquareQuote,
  MonitorPlay,
  MousePointerClick,
  MoveHorizontal,
  Newspaper,
  PartyPopper,
  Plug,
  Receipt,
  Route,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  SquareParking,
  Star,
  Table,
  TrendingUp,
  Truck,
  Bus,
  Type,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import type { TipoMiniaturaSeccion } from '@/components/sitio-web/ui/SectionThumbnail';

const ICONOS: Readonly<Record<string, LucideIcon>> = {
  Award,
  BadgeCheck,
  BedDouble,
  Bike,
  Bus,
  CalendarCheck,
  CalendarDays,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  CreditCard,
  Dumbbell,
  FileText,
  Filter,
  Flame,
  FolderOpen,
  FolderTree,
  Gauge,
  Handshake,
  HelpCircle,
  Image,
  Images,
  Layout: LayoutGrid,
  LayoutGrid,
  LayoutPanelLeft,
  List,
  ListChecks,
  Mail,
  Map: IconoMapa,
  MapPin,
  Megaphone,
  MessageSquareQuote,
  MonitorPlay,
  MousePointerClick,
  MoveHorizontal,
  Newspaper,
  PartyPopper,
  Plug,
  Receipt,
  Route,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  SquareParking,
  Star,
  Table,
  TrendingUp,
  Truck,
  Type,
  Users,
  UtensilsCrossed,
};

export function iconoDeSeccion(tipo: string): LucideIcon {
  const nombre = getSectionDefinition(tipo)?.icon;
  return (nombre && ICONOS[nombre]) || LayoutGrid;
}

/** Variantes cuyo propósito pide otra miniatura que la del tipo (Historia por capítulos: tarjetas con imagen). */
const MINIATURA_VARIANTE: Readonly<Record<string, TipoMiniaturaSeccion>> = {
  'how_it_works:chapters': 'galeria',
  // Plantillas de tienda (B3).
  'transformation:slider': 'galeria',
  'image_text:color_block': 'galeria',
  'gallery:instagram_cta': 'galeria',
};

/** Tipos nuevos de las plantillas de tienda cuyo nombre no lleva a su miniatura. */
const MINIATURA_TIPO: Readonly<Record<string, TipoMiniaturaSeccion>> = {
  shop_the_look: 'galeria',
  welcome_popup: 'llamado_accion',
  service_cards: 'llamado_accion',
  link_cloud: 'texto',
};

/** Miniatura del kit del módulo más cercana al propósito de la sección (y de su variante, si cambia). */
export function miniaturaDeSeccion(tipo: string, variante?: string | null): TipoMiniaturaSeccion {
  const propia = variante ? MINIATURA_VARIANTE[`${tipo}:${variante}`] : undefined;
  if (propia) return propia;
  if (MINIATURA_TIPO[tipo]) return MINIATURA_TIPO[tipo];
  const t = tipo.toLowerCase();
  if (t.includes('hero') || t === 'category_header') return 'portada';
  if (t.startsWith('menu') || t.includes('dish') || t === 'specialties') return 'carta_destacada';
  if (t.includes('gallery') || t.includes('bento')) return 'galeria';
  if (t.includes('reserv') || t.includes('booking') || t.includes('trip')) return 'reservas';
  if (t.includes('testimon') || t.includes('review') || t.includes('feedback')) return 'opiniones';
  if (t.includes('map') || t.includes('location') || t.includes('hours') || t.includes('coverage')) return 'ubicacion_horario';
  if (t.includes('product') || t.includes('categor') || t.includes('offer') || t.includes('room') || t.includes('plan') || t.includes('pricing')) {
    return 'productos';
  }
  if (t.includes('event') || t.includes('schedule')) return 'eventos';
  if (t.includes('cta') || t.includes('newsletter') || t.includes('banner') || t.includes('countdown')) return 'llamado_accion';
  return 'texto';
}

export function nombreDeSeccion(tipo: string): string {
  return getSectionDefinition(tipo)?.label ?? tipo;
}

/**
 * Nombre en la lista de secciones: el del tipo y, cuando la variante cambia el propósito de la
 * sección (Carta QR, lámina 17), la variante: «Portada de mesa», «Carta completa · QR».
 */
const NOMBRE_EN_LISTA: Readonly<Record<string, string>> = {
  'restaurant_hero:mesa': 'Portada de mesa',
  'menu_full:qr': 'Carta completa · QR',
  // «Café de especialidad» (Figma 2223:46106, láminas 12 a 15).
  'hero:carousel_editorial': 'Portada · Carrusel editorial',
  'how_it_works:chapters': 'Historia por capítulos',
  'menu_full:dotted': 'Carta completa · Línea de puntos',
  'reservation:floor_plan': 'Reserva con plano de mesas',
};

export function nombreEnLista(tipo: string, variante: string): string {
  return NOMBRE_EN_LISTA[`${tipo}:${variante}`] ?? nombreDeSeccion(tipo);
}

export function nombreDeVariante(tipo: string, variante: string): string {
  return getSectionDefinition(tipo)?.variants.find((v) => v.id === variante)?.label ?? variante;
}
