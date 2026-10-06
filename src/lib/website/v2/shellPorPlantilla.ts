/**
 * Encabezado y pie POR PLANTILLA: los valores por defecto aprobados en Figma («16 Sitio web»,
 * sección 2028:38223, una lámina por plantilla; aprobado por el dueño el 2026-10-06).
 *
 * TODO es editable en el editor («Encabezado» y «Pie de página»): esto es solo el valor con que
 * nace el sitio al aplicar la «Plantilla completa» y al que vuelve «Restablecer a la plantilla».
 *
 * - Las claves de `opciones` son las del contrato (`OPCIONES_SHELL` de `mapeoAjustes.ts`). Los
 *   botones no llevan URL fija: llevan un DESTINO (página del juego base, ruta del sitio público
 *   que existe en todas las organizaciones, o un destino especial `whatsapp` / `maps`) que
 *   `plantillaCompleta.ts` resuelve contra las páginas reales del documento. Si el destino no
 *   existe, el botón no se pone: nunca un enlace roto.
 * - Los menús del pie se nombran por clave (`ClaveMenuPie`); `plantillaCompleta.ts` los crea con
 *   páginas reales del documento o rutas del sitio público.
 * - Sin anuncios inventados: las láminas traían textos de ejemplo en la barra superior (precios,
 *   promociones, eventos). No se copian: serían hechos falsos en el sitio de una organización
 *   real. El dueño los escribe en «Barra superior».
 * - Giro como respaldo: una plantilla sin entrada usa la de su giro (`SHELL_RESPALDO_GIRO`).
 *   Parqueadero: `parqueadero_A` por defecto; `parking_tech` usa `parqueadero_B`.
 * - Barra fija del celular: `auto` (lo de hoy) en restaurante; en los demás giros la lista de
 *   acciones del giro (decisión del contrato, 2026-10-06).
 */
import type { Giro } from '@/components/sitio-web/paginas/plantillasPagina';

/** Rutas del sitio público que existen para cualquier organización (goadmin-websites `app/*`). */
export const RUTAS_SITIO_PUBLICO = ['/reservas', '/agendar', '/consultar-pedido', '/tracking', '/mi-cuenta'] as const;
export type RutaSitioPublico = (typeof RUTAS_SITIO_PUBLICO)[number];

export type DestinoBoton =
  /** Primera página del documento que exista, por dirección (slug). */
  | { paginas: readonly string[] }
  | { ruta: RutaSitioPublico }
  | { especial: 'whatsapp' | 'maps' };

export interface BotonPlantilla {
  texto: string;
  destino: DestinoBoton;
}

export type ClaveMenuPie =
  | 'legal'
  | 'la-casa'
  | 'eventos'
  | 'ayuda'
  | 'envios-devoluciones'
  | 'envios'
  | 'atencion'
  | 'politicas'
  | 'alergenos'
  | 'servicios'
  | 'empresa'
  | 'planes'
  | 'el-club'
  | 'tarifas';

export interface ShellPlantilla {
  encabezado: {
    composicion: string;
    /** Megamenú con las categorías del Inventario (o las páginas de catálogo si no hay). */
    megaCategorias?: boolean;
    boton: BotonPlantilla | null;
    boton2: BotonPlantilla | null;
    /** Opciones del contrato, sin `header_cta*` (salen de los botones). */
    opciones: Readonly<Record<string, unknown>>;
  };
  pie: {
    composicion: string;
    menus: readonly ClaveMenuPie[];
    opciones: Readonly<Record<string, unknown>>;
  };
}

const RESERVAR_MESA: DestinoBoton = { paginas: ['reservas-mesa', 'reservas'] };
const PEDIR: DestinoBoton = { paginas: ['domicilios', 'menu'] };
const SIN_ACCIONES = { show_header_cart: false, show_header_auth: false, search_style: 'hidden' } as const;

const BARRA_MOVIL: Partial<Record<Giro, readonly string[]>> = {
  servicios: ['agendar', 'whatsapp', 'llamar'],
  gimnasio: ['prueba', 'como_llegar', 'llamar'],
  hotel: ['reservar', 'llamar', 'como_llegar'],
  tienda: ['whatsapp', 'llamar', 'como_llegar'],
  parqueadero: ['reservar', 'como_llegar', 'llamar'],
};

const conBarra = (giro: Giro, opciones: Record<string, unknown>) =>
  BARRA_MOVIL[giro] ? { ...opciones, mobile_bottom_bar: [...BARRA_MOVIL[giro]!] } : opciones;

export const SHELL_POR_PLANTILLA: Readonly<Record<string, ShellPlantilla>> = {
  // ─── Restaurante ───────────────────────────────────────────────────────────────────────────
  noir_omakase: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Reservar mesa', destino: RESERVAR_MESA },
      boton2: null,
      opciones: { ...SIN_ACCIONES, logo_position: 'center', show_topbar: true, topbar_show_branch_status: true, header_show_language: true, mobile_menu_style: 'fullscreen', mobile_bottom_bar: 'auto' },
    },
    pie: {
      composicion: 'centered',
      menus: ['legal'],
      opciones: { footer_background: 'tema', footer_show_hours: true, footer_show_contact: true, footer_show_social: true, footer_show_whatsapp: true, show_powered_by: false, mobile_footer_style: 'accordion' },
    },
  },
  velvet_lounge: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Reservar', destino: RESERVAR_MESA },
      boton2: { texto: 'Eventos', destino: { paginas: ['eventos'] } },
      opciones: { ...SIN_ACCIONES, show_topbar: true, topbar_show_branch_status: true, mobile_menu_style: 'drawer' },
    },
    pie: {
      composicion: 'three_columns',
      menus: ['eventos', 'legal'],
      opciones: { footer_background: 'tema', footer_show_hours: true, footer_show_newsletter: true, footer_newsletter_title: 'Agenda de eventos', mobile_footer_style: 'accordion' },
    },
  },
  fine_dining_oscuro: {
    encabezado: {
      composicion: 'minimal',
      boton: { texto: 'Reservar', destino: RESERVAR_MESA },
      boton2: null,
      opciones: { ...SIN_ACCIONES, header_show_language: true, mobile_menu_style: 'fullscreen' },
    },
    pie: { composicion: 'split', menus: ['legal'], opciones: { footer_background: 'tema', footer_show_hours: true, show_powered_by: false, mobile_footer_style: 'accordion' } },
  },
  editorial_marfil: {
    encabezado: {
      composicion: 'centered',
      boton: { texto: 'Reservar', destino: RESERVAR_MESA },
      boton2: null,
      opciones: { ...SIN_ACCIONES, show_topbar: true, topbar_show_branch_status: true, mobile_menu_style: 'drawer' },
    },
    pie: {
      composicion: 'three_columns',
      menus: ['la-casa', 'legal'],
      opciones: { footer_background: 'tema', footer_show_map: true, footer_show_hours: true, mobile_footer_style: 'stacked' },
    },
  },
  mediterraneo: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Reservar', destino: RESERVAR_MESA },
      boton2: null,
      opciones: { ...SIN_ACCIONES, header_show_branch_selector: true, mobile_menu_style: 'drawer' },
    },
    pie: {
      composicion: 'default',
      menus: ['legal'],
      opciones: { footer_background: 'tema', footer_show_hours: true, footer_show_map: true, footer_show_whatsapp: true, mobile_footer_style: 'accordion' },
    },
  },
  bistro_ilustrado: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Pedir a domicilio', destino: PEDIR },
      boton2: { texto: 'Reservar', destino: RESERVAR_MESA },
      opciones: { show_topbar: true, show_header_cart: true, show_header_auth: false, search_style: 'hidden', mobile_menu_style: 'bottom_sheet' },
    },
    pie: {
      composicion: 'three_columns',
      menus: ['ayuda', 'legal'],
      opciones: { footer_background: 'tema', footer_show_whatsapp: true, footer_show_payment_methods: true, footer_show_hours: true, mobile_footer_style: 'accordion' },
    },
  },
  pop_callejero: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Pedir ya', destino: PEDIR },
      boton2: null,
      opciones: { show_topbar: true, topbar_show_free_shipping: true, show_header_cart: true, show_header_auth: false, search_style: 'hidden', mobile_menu_style: 'tabs' },
    },
    pie: {
      composicion: 'minimal',
      menus: ['legal'],
      opciones: { footer_background: 'tema', footer_show_whatsapp: true, footer_show_payment_methods: true, mobile_footer_style: 'stacked' },
    },
  },
  carta_qr: {
    encabezado: {
      composicion: 'default',
      boton: null,
      boton2: null,
      opciones: {
        header_menu_source: 'categorias_carta',
        header_show_branch_selector: true,
        header_show_language: true,
        search_style: 'icon',
        mobile_search_style: 'bar',
        show_header_cart: false,
        show_header_auth: false,
        mobile_menu_style: 'bottom_sheet',
        mobile_bottom_bar: 'ninguna',
      },
    },
    pie: { composicion: 'minimal', menus: ['alergenos'], opciones: { footer_background: 'tema', show_powered_by: true, mobile_footer_style: 'stacked' } },
  },
  // ─── Tienda ────────────────────────────────────────────────────────────────────────────────
  retail_modern: {
    encabezado: {
      composicion: 'mega',
      megaCategorias: true,
      boton: null,
      boton2: null,
      opciones: conBarra('tienda', { show_topbar: true, topbar_show_free_shipping: true, show_categories_in_header: true, mega_menu_columns: 4, search_style: 'bar', mobile_search_style: 'bar', show_header_cart: true, show_header_auth: true, mobile_menu_style: 'tabs' }),
    },
    pie: {
      composicion: 'three_columns',
      menus: ['ayuda', 'envios-devoluciones', 'legal'],
      opciones: { footer_show_contact: false, footer_background: 'tema', footer_show_newsletter: true, footer_show_payment_methods: true, mobile_footer_style: 'accordion' },
    },
  },
  retail_classic: {
    encabezado: {
      composicion: 'centered',
      boton: null,
      boton2: null,
      opciones: conBarra('tienda', { show_topbar: true, topbar_show_free_shipping: true, search_style: 'icon', show_header_cart: true, show_header_auth: true, mobile_menu_style: 'drawer' }),
    },
    pie: { composicion: 'default', menus: ['ayuda', 'envios', 'legal'], opciones: { footer_show_contact: false, footer_background: 'tema', footer_show_payment_methods: true, mobile_footer_style: 'accordion' } },
  },
  retail_bold: {
    encabezado: {
      composicion: 'default',
      boton: null,
      boton2: null,
      opciones: conBarra('tienda', { show_topbar: true, search_style: 'icon', show_header_cart: true, show_header_auth: true, mobile_menu_style: 'tabs' }),
    },
    pie: { composicion: 'minimal', menus: ['ayuda', 'legal'], opciones: { footer_show_contact: false, footer_background: 'tema', footer_show_payment_methods: true, mobile_footer_style: 'stacked' } },
  },
  retail_elegant: {
    encabezado: {
      composicion: 'default',
      boton: null,
      boton2: null,
      opciones: conBarra('tienda', { logo_position: 'center', search_style: 'icon', show_header_cart: true, show_header_auth: true, mobile_menu_style: 'fullscreen' }),
    },
    pie: { composicion: 'centered', menus: ['atencion', 'envios', 'legal'], opciones: { footer_show_contact: false, footer_background: 'tema', footer_show_payment_methods: true, mobile_footer_style: 'accordion' } },
  },
  // ─── Hotel ─────────────────────────────────────────────────────────────────────────────────
  hotel_luxury: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Reservar', destino: { ruta: '/reservas' } },
      boton2: null,
      opciones: conBarra('hotel', { ...SIN_ACCIONES, header_booking_bar: true, header_show_language: true, mobile_menu_style: 'drawer' }),
    },
    pie: {
      composicion: 'three_columns',
      menus: ['politicas', 'legal'],
      opciones: { footer_background: 'tema', footer_show_map: true, footer_show_payment_methods: true, mobile_footer_style: 'accordion' },
    },
  },
  hotel_boutique: {
    encabezado: {
      composicion: 'centered',
      boton: { texto: 'Reservar', destino: { ruta: '/reservas' } },
      boton2: null,
      opciones: conBarra('hotel', { ...SIN_ACCIONES, show_topbar: true, header_show_language: true, mobile_menu_style: 'fullscreen' }),
    },
    pie: { composicion: 'centered', menus: ['politicas', 'legal'], opciones: { footer_background: 'tema', footer_show_whatsapp: true, mobile_footer_style: 'accordion' } },
  },
  hotel_minimal: {
    encabezado: {
      composicion: 'minimal',
      boton: { texto: 'Reservar', destino: { ruta: '/reservas' } },
      boton2: null,
      opciones: conBarra('hotel', { ...SIN_ACCIONES, header_show_language: true, mobile_menu_style: 'fullscreen' }),
    },
    pie: { composicion: 'minimal', menus: ['politicas'], opciones: { footer_background: 'tema', show_powered_by: true, mobile_footer_style: 'stacked' } },
  },
  hotel_resort: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Reservar', destino: { ruta: '/reservas' } },
      boton2: null,
      opciones: conBarra('hotel', { ...SIN_ACCIONES, show_topbar: true, header_booking_bar: true, header_show_language: true, mobile_menu_style: 'drawer' }),
    },
    pie: {
      composicion: 'three_columns',
      menus: ['politicas', 'legal'],
      opciones: { footer_background: 'tema', footer_show_newsletter: true, footer_newsletter_title: 'Ofertas por correo', footer_show_payment_methods: true, mobile_footer_style: 'accordion' },
    },
  },
  // ─── Servicios ─────────────────────────────────────────────────────────────────────────────
  services_modern: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Agendar cita', destino: { ruta: '/agendar' } },
      boton2: { texto: 'WhatsApp', destino: { especial: 'whatsapp' } },
      opciones: conBarra('servicios', { ...SIN_ACCIONES, mobile_menu_style: 'drawer' }),
    },
    pie: { composicion: 'three_columns', menus: ['servicios', 'empresa'], opciones: { footer_background: 'tema', footer_show_hours: true, footer_show_whatsapp: true, mobile_footer_style: 'accordion' } },
  },
  services_corporate: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Agendar cita', destino: { ruta: '/agendar' } },
      boton2: null,
      opciones: conBarra('servicios', { ...SIN_ACCIONES, show_topbar: true, topbar_show_phone: true, topbar_show_email: true, mobile_menu_style: 'drawer' }),
    },
    pie: { composicion: 'three_columns', menus: ['servicios', 'empresa', 'legal'], opciones: { footer_background: 'tema', footer_show_hours: true, mobile_footer_style: 'accordion' } },
  },
  services_creative: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Agendar llamada', destino: { ruta: '/agendar' } },
      boton2: { texto: 'WhatsApp', destino: { especial: 'whatsapp' } },
      opciones: conBarra('servicios', { ...SIN_ACCIONES, mobile_menu_style: 'fullscreen' }),
    },
    pie: { composicion: 'minimal', menus: ['legal'], opciones: { footer_background: 'tema', footer_show_whatsapp: true, mobile_footer_style: 'stacked' } },
  },
  services_minimal: {
    encabezado: {
      composicion: 'minimal',
      boton: { texto: 'Agendar cita', destino: { ruta: '/agendar' } },
      boton2: null,
      opciones: conBarra('servicios', { ...SIN_ACCIONES, mobile_menu_style: 'fullscreen' }),
    },
    pie: { composicion: 'centered', menus: ['legal'], opciones: { footer_background: 'tema', footer_show_whatsapp: true, show_powered_by: true, mobile_footer_style: 'stacked' } },
  },
  // ─── Gimnasio ──────────────────────────────────────────────────────────────────────────────
  gym_power: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Únete ahora', destino: { paginas: ['membresias'] } },
      boton2: { texto: 'Prueba gratis', destino: { paginas: ['contacto'] } },
      opciones: conBarra('gimnasio', { show_topbar: true, topbar_show_branch_status: true, show_header_cart: false, show_header_auth: true, search_style: 'hidden', mobile_menu_style: 'drawer' }),
    },
    pie: { composicion: 'three_columns', menus: ['planes', 'legal'], opciones: { footer_background: 'tema', footer_show_hours: true, mobile_footer_style: 'accordion' } },
  },
  gym_wellness: {
    encabezado: {
      composicion: 'minimal',
      boton: { texto: 'Reservar clase', destino: { paginas: ['clases'] } },
      boton2: { texto: 'Prueba gratis', destino: { paginas: ['contacto'] } },
      opciones: conBarra('gimnasio', { show_header_cart: false, show_header_auth: true, search_style: 'hidden', mobile_menu_style: 'fullscreen' }),
    },
    pie: { composicion: 'centered', menus: ['legal'], opciones: { footer_background: 'tema', footer_show_hours: true, footer_show_whatsapp: true, mobile_footer_style: 'accordion' } },
  },
  gym_urban: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Unirme', destino: { paginas: ['membresias'] } },
      boton2: null,
      opciones: conBarra('gimnasio', { show_topbar: true, show_header_cart: false, show_header_auth: true, search_style: 'hidden', mobile_menu_style: 'tabs' }),
    },
    pie: { composicion: 'minimal', menus: ['legal'], opciones: { footer_background: 'tema', mobile_footer_style: 'stacked' } },
  },
  gym_premium: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Membresía VIP', destino: { paginas: ['membresias'] } },
      boton2: { texto: 'Visita guiada', destino: { paginas: ['contacto'] } },
      opciones: conBarra('gimnasio', { logo_position: 'center', show_header_cart: false, show_header_auth: true, search_style: 'hidden', mobile_menu_style: 'fullscreen' }),
    },
    pie: { composicion: 'three_columns', menus: ['el-club', 'legal'], opciones: { footer_background: 'tema', footer_show_hours: true, mobile_footer_style: 'accordion' } },
  },
  // ─── Parqueadero (sin láminas por plantilla del catálogo: A por defecto) ───────────────────
  parqueadero_A: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Reservar espacio', destino: { paginas: ['tarifas'] } },
      boton2: { texto: 'Cómo llegar', destino: { especial: 'maps' } },
      opciones: conBarra('parqueadero', { ...SIN_ACCIONES, show_topbar: true, topbar_show_availability: true, mobile_menu_style: 'drawer' }),
    },
    pie: { composicion: 'default', menus: ['tarifas', 'legal'], opciones: { footer_background: 'tema', footer_show_map: true, footer_show_hours: true, mobile_footer_style: 'stacked' } },
  },
  parqueadero_B: {
    encabezado: {
      composicion: 'minimal',
      boton: { texto: 'Cómo llegar', destino: { especial: 'maps' } },
      boton2: null,
      opciones: conBarra('parqueadero', { ...SIN_ACCIONES, show_topbar: true, topbar_show_availability: true, mobile_menu_style: 'drawer' }),
    },
    pie: { composicion: 'default', menus: ['tarifas'], opciones: { footer_background: 'tema', footer_show_map: true, mobile_footer_style: 'stacked' } },
  },
};

/** Plantillas del catálogo que usan una lámina con otro nombre. */
const ALIAS_PLANTILLA: Readonly<Record<string, string>> = {
  parking_tech: 'parqueadero_B',
};

/**
 * Respaldo por giro: la lámina de la plantilla por defecto del giro. Transporte no tiene láminas
 * aprobadas: conserva lo que traía la «Plantilla completa» (clásico, «Cotizar viaje»).
 */
export const SHELL_RESPALDO_GIRO: Readonly<Record<Giro, ShellPlantilla>> = {
  restaurante: SHELL_POR_PLANTILLA.noir_omakase,
  tienda: SHELL_POR_PLANTILLA.retail_modern,
  hotel: SHELL_POR_PLANTILLA.hotel_luxury,
  servicios: SHELL_POR_PLANTILLA.services_modern,
  gimnasio: SHELL_POR_PLANTILLA.gym_power,
  parqueadero: SHELL_POR_PLANTILLA.parqueadero_A,
  transporte: {
    encabezado: {
      composicion: 'default',
      boton: { texto: 'Cotizar viaje', destino: { paginas: ['contacto'] } },
      boton2: null,
      opciones: { show_header_cart: false, show_header_auth: false },
    },
    pie: { composicion: 'three_columns', menus: ['legal'], opciones: { footer_show_hours: true } },
  },
};

/** Lámina de una plantilla del catálogo; si no tiene, la de su giro. */
export function shellDePlantilla(plantillaId: string | null | undefined, giro: Giro): ShellPlantilla {
  const id = plantillaId ? (ALIAS_PLANTILLA[plantillaId] ?? plantillaId) : null;
  return (id && SHELL_POR_PLANTILLA[id]) || SHELL_RESPALDO_GIRO[giro];
}
