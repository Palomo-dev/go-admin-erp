/**
 * Iconos del área «ventas» (Ventas en línea B/10, Sedes en la web B/11 y
 * Tienda), en un solo lugar. Puro: sin React, lo prueban los tests.
 *
 * Por qué: el dueño pidió que los estados y las acciones se entiendan por el
 * icono antes que por el texto. Cada pantalla del área importa de aquí; la
 * escala (14/16/20/40) y el trazo (1,5) salen de `ui/iconosSitio.ts`, la
 * tabla única del módulo.
 *
 * - Temas del tablero: los de la captura B/10-01. Pagos reutiliza el de la
 *   tarea «pagos» del módulo (lista de lanzamiento), Checkout el de «Ventas en
 *   línea» del menú.
 * - Estado de cada tarjeta: el MISMO criterio que PublishStatusBadge (A/07a):
 *   check = listo; aviso = falta algo; círculo punteado = opcional; candado =
 *   lo da otro módulo que el plan no incluye.
 * - Botones «Ir a …»: el icono de la página destino tal como sale en el menú
 *   (catálogo de navegación). Quien ve el billete de Finanzas en el menú lo
 *   reconoce en el botón. Nada de una segunda tabla de iconos de módulos.
 */
import {
  AlertCircle,
  ArrowRight,
  Bike,
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock,
  EyeOff,
  Globe,
  Link2,
  ListOrdered,
  Lock,
  MapPin,
  MessageSquare,
  Package,
  PackageX,
  PanelTop,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Ticket,
  Truck,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { ICONO_TAREA_SITIO } from '../ui/iconosSitio';
import type { EstadoTarjetaVenta, MarcaFila, TemaVenta, TipoEntrega } from './estadoVentas';
import type { ModoSedes } from './sedesWeb';

/** Icono de cada tema del tablero (B/10-01, B/10-02). */
export const ICONO_TEMA_VENTA: Record<TemaVenta, LucideIcon> = {
  checkout: ICONO_TAREA_SITIO.ventas, // carrito = «Ventas en línea» en el menú
  pagos: ICONO_TAREA_SITIO.pagos,
  envios: Truck,
  cupones: Ticket,
  pedidos: ShoppingBag,
  reservas: UtensilsCrossed,
  pasarela: ShieldCheck,
};

/** Icono dentro del badge de estado de cada tarjeta (va con su texto). */
export const ICONO_ESTADO_VENTA: Record<EstadoTarjetaVenta, LucideIcon> = {
  configurado: Check,
  falta: AlertCircle,
  opcional: CircleDashed,
  disponible: Lock,
};

/** Marca de cada fila de una tarjeta: check verde, aviso ámbar o círculo atenuado. */
export const ICONO_MARCA_FILA: Record<MarcaFila, { icono: LucideIcon; clase: string }> = {
  ok: { icono: CheckCircle2, clase: 'text-success-text' },
  alerta: { icono: AlertCircle, clase: 'text-warning-text' },
  neutro: { icono: Circle, clase: 'text-fg-muted' },
};

/** Cómo recibe el cliente el pedido (chips del checkout): tienda, moto propia, transportadora o mesa. */
export const ICONO_ENTREGA: Record<TipoEntrega, LucideIcon> = {
  pickup: Store,
  delivery_own: Bike,
  delivery_third_party: Truck,
  dine_in: UtensilsCrossed,
};

/** Cómo se ve el checkout: por pasos (lista numerada) o en una página. */
export const ICONO_MODO_CHECKOUT: Record<'steps' | 'one_page', LucideIcon> = {
  steps: ListOrdered,
  one_page: PanelTop,
};

/** Secciones del diálogo del checkout: compra, confianza y envío. */
export const ICONO_SECCION_CHECKOUT = {
  compra: ICONO_TEMA_VENTA.checkout,
  confianza: ShieldCheck,
  envio: Truck,
} as const satisfies Record<string, LucideIcon>;

/** Modo de mostrar las sedes (B/11-01): el cliente elige la sede o cada sede tiene su sitio. */
export const ICONO_MODO_SEDES: Record<ModoSedes, LucideIcon> = {
  selector: ICONO_TAREA_SITIO.sedes, // pin = «Sedes en la web» en el menú
  per_branch: ICONO_TAREA_SITIO.sitio, // un globo = un sitio
};

/** Datos de una sede en la lista (móvil) y en la tabla (escritorio). */
export const ICONO_DATO_SEDE = {
  direccionWeb: Link2,
  horario: Clock,
  oculta: EyeOff,
  soloStock: Package,
  ubicacion: MapPin,
  sitio: Globe,
  /** Dominio propio de la sede (norte.tumarca.com, B/11-02). */
  dominio: Globe,
} as const satisfies Record<string, LucideIcon>;

/**
 * Interruptores de cada producto del catálogo web. En móvil cada uno lleva
 * su icono y su texto al lado: dos interruptores sin nombre visible se
 * confunden (marcar «agotado» creyendo que se oculta).
 */
export const ICONO_INTERRUPTOR_CATALOGO = {
  enWeb: Globe,
  agotado: PackageX,
} as const satisfies Record<string, LucideIcon>;


/** Estado de una reseña: reloj = espera, check = aprobada, × = rechazada. */
export const ICONO_ESTADO_RESENA = {
  pending: Clock,
  approved: Check,
  rejected: X,
} as const satisfies Record<'pending' | 'approved' | 'rejected', LucideIcon>;

/** Acciones de moderación de una reseña. */
export const ICONO_ACCION_RESENA = {
  aprobar: Check,
  rechazar: X,
  responder: MessageSquare,
  calificacion: Star,
} as const satisfies Record<string, LucideIcon>;

/** Pestañas de Tienda: catálogo (= Tienda en el menú), plantillas (= Plantillas) y reseñas. */
export const ICONO_PESTANA_TIENDA = {
  catalogo: ICONO_TAREA_SITIO.catalogo,
  plantillas: ICONO_TAREA_SITIO.plantilla,
  resenas: Star,
} as const satisfies Record<string, LucideIcon>;

/** Ruta sin la consulta ni el ancla (`/app/pos/reservas-mesas?tab=…` → `/app/pos/reservas-mesas`). */
function rutaBase(href: string): string {
  return href.split(/[?#]/)[0].replace(/\/+$/, '');
}

/**
 * Icono de la página a la que lleva un «Ir a …»: el de su entrada en el menú;
 * si la página no está en el menú, el de su módulo; si tampoco, una flecha.
 */
export function iconoDestino(href: string): LucideIcon {
  const ruta = rutaBase(href);
  let mejor: { icono: LucideIcon; largo: number } | null = null;
  for (const modulo of CATALOGO_NAV) {
    for (const p of modulo.paginas) {
      const base = rutaBase(p.href);
      if (base === ruta) return p.icono;
    }
    for (const r of modulo.rutas) {
      const base = rutaBase(r);
      if ((ruta === base || ruta.startsWith(`${base}/`)) && (!mejor || base.length > mejor.largo)) {
        mejor = { icono: modulo.icono, largo: base.length };
      }
    }
  }
  return mejor?.icono ?? ArrowRight;
}
