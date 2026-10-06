/**
 * Iconografía del módulo Sitio web, en un solo lugar (Manual de marca v2.0 §5,
 * CATALOGO-ICONOS.md). Puro: sin React, lo prueban los tests.
 *
 * Por qué existe: el dueño pidió que los estados y las tareas se entiendan por
 * el icono antes que por el texto («los iconos los entiende más fácil
 * cualquier usuario»). Para que eso funcione, el MISMO estado lleva el MISMO
 * icono en el Resumen, Diseño, Páginas, Configuración y el editor, y todos con
 * la misma escala de tamaños. Ninguna pantalla elige su icono ni su tamaño
 * por su cuenta: importa de aquí.
 *
 * Reglas:
 * - Lucide de trazo 1,5 sobre grilla de 24 (`TRAZO_ICONO`). Los iconos
 *   dentro de un Badge van a 2 (los pinta el propio Badge).
 * - El icono acompaña al texto, nunca lo sustituye: siempre `aria-hidden`.
 * - El color sale del tono del dato (estadoTono / tonosKit), no del icono.
 */
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Briefcase,
  Dumbbell,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  CloudUpload,
  Copy,
  CreditCard,
  EyeOff,
  FileText,
  Globe,
  Image as ImageIcon,
  Info,
  Laptop,
  LayoutGrid,
  Link2,
  ListTree,
  Loader2,
  MapPin,
  Monitor,
  MousePointerClick,
  Palette,
  PanelTop,
  RectangleHorizontal,
  PencilLine,
  Rocket,
  RotateCw,
  Search,
  Settings,
  Shapes,
  Smartphone,
  Tablet,
  Sparkles,
  SquareParking,
  SquareRoundCorner,
  ShoppingBag,
  Store,
  ShoppingCart,
  Truck,
  Type,
  UtensilsCrossed,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { TonoBadge } from '@/components/kit/estadoTono';
import type { EstadoPublicacion } from './estadoPublicacion';
import type { DispositivoVista } from './dispositivos';
import type { EstadoRegistroDns } from './DnsRecordRow';

/** Grosor de trazo de todos los iconos sueltos del módulo. */
export const TRAZO_ICONO = 1.5;

/**
 * Escala de tamaños (px), la única del módulo:
 * - `meta` 14: metadatos de 12/16 y subtítulos de 13/18 (fecha, host, «Programado»).
 * - `base` 16: botones, títulos de sección, índice lateral, filas de escritorio.
 * - `fila` 20: filas móviles (toque de 44+) y dentro de la caja de 40.
 * - `caja` 40: caja con tinte del PageHeader y de las tarjetas de tarea.
 */
export const TAMANO_ICONO = { meta: 14, base: 16, fila: 20, caja: 40 } as const;
export type TamanoIcono = keyof typeof TAMANO_ICONO;

/** Clase Tailwind de cada tamaño (la misma tabla que `TAMANO_ICONO`). */
export const CLASE_TAMANO_ICONO: Record<TamanoIcono, string> = {
  meta: 'size-3.5',
  base: 'size-4',
  fila: 'size-5',
  caja: 'size-10',
};

/**
 * Caja de icono con tinte: `sm` 32 con icono de 16 (filas densas, checklist),
 * `md` 40 con icono de 20 (PageHeader, tarjetas de tarea, Ventas en línea).
 * Las dos con radio 8 (`rounded-lg`), el mismo de la caja de 32 de FormSection
 * del kit: una caja de icono mide distinto, pero no cambia de forma.
 */
export const CAJA_ICONO = {
  sm: { caja: 'size-8 rounded-lg', icono: CLASE_TAMANO_ICONO.base, px: 32 },
  md: { caja: 'size-10 rounded-lg', icono: CLASE_TAMANO_ICONO.fila, px: 40 },
} as const;
export type TamanoCajaIcono = keyof typeof CAJA_ICONO;

/**
 * Icono de cada estado de publicación (A/07a). Se eligen por lo que la persona
 * entiende sin leer: check = está en el aire; nube con flecha = hay algo por
 * subir; lápiz = borrador; calendario con reloj = programado; ojo tachado =
 * nadie lo ve todavía; triángulo = algo falló.
 */
export const ICONO_ESTADO_PUBLICACION: Record<EstadoPublicacion['tipo'], LucideIcon> = {
  publicado: Check,
  cambios: CloudUpload,
  borrador: PencilLine,
  guardando: Loader2,
  programado: CalendarClock,
  sin_publicar: EyeOff,
  error: AlertTriangle,
};

/** Estados cuyo icono gira (y deja de girar con `prefers-reduced-motion`). */
export function iconoGira(tipo: EstadoPublicacion['tipo']): boolean {
  return tipo === 'guardando';
}

/**
 * Tareas del sitio (lista de lanzamiento, asistente, alertas, tarjetas de
 * Ventas en línea). Las que tienen subpágina usan el MISMO icono que su
 * entrada del menú (src/lib/navigation/catalog.ts): quien ve «Dominios» con
 * un eslabón en el menú lo reconoce en la lista de lanzamiento.
 */
export type TareaSitio =
  | 'giro'
  | 'plantilla'
  | 'estilo'
  | 'logo'
  | 'paginas'
  | 'menu'
  | 'encabezado'
  | 'carta'
  | 'catalogo'
  | 'ventas'
  | 'pagos'
  | 'dominio'
  | 'seo'
  | 'analitica'
  | 'sedes'
  | 'configuracion'
  | 'publicar'
  | 'sitio';

export const ICONO_TAREA_SITIO: Record<TareaSitio, LucideIcon> = {
  giro: Store, // tipo de negocio (asistente, paso 1)
  plantilla: LayoutGrid, // = Plantillas en el menú
  estilo: Wand2, // = Diseño
  logo: ImageIcon,
  paginas: FileText, // = Páginas
  menu: ListTree, // Páginas › Menú y navegación
  encabezado: PanelTop, // encabezado y pie del sitio
  carta: UtensilsCrossed, // = Carta
  catalogo: ShoppingBag, // = Tienda
  ventas: ShoppingCart, // = Ventas en línea
  pagos: CreditCard,
  dominio: Link2, // = Dominios
  seo: Search, // = SEO y redes
  analitica: BarChart3, // = Analítica
  sedes: MapPin, // = Sedes en la web
  configuracion: Settings, // = Configuración
  publicar: Rocket,
  sitio: Globe, // = icono del módulo
};

/**
 * Giro del negocio (asistente A/03a, plantillas A/06b). Restaurante y Tienda
 * repiten el icono de Carta y Tienda: es el mismo concepto. «Otro» usa formas
 * y no la cuadrícula, que ya es «Plantillas».
 */
export type GiroIcono = 'restaurante' | 'tienda' | 'hotel' | 'servicios' | 'gimnasio' | 'otro';

export const ICONO_GIRO_SITIO: Record<GiroIcono, LucideIcon> = {
  restaurante: UtensilsCrossed,
  tienda: ShoppingBag,
  hotel: BedDouble,
  servicios: Briefcase,
  gimnasio: Dumbbell,
  otro: Shapes,
};

/**
 * Cifras del sitio (KPIs del Resumen A/02a y de Analítica B/09): el mismo
 * icono para la misma métrica en las dos pantallas. Pedidos usa el carrito de
 * «Ventas en línea»; conversión, el clic que termina en compra o reserva.
 */
export type KpiSitio = 'visitas' | 'pedidos' | 'reservas' | 'conversion';

export const ICONO_KPI_SITIO: Record<KpiSitio, LucideIcon> = {
  visitas: Users,
  pedidos: ShoppingCart,
  reservas: CalendarCheck,
  conversion: MousePointerClick,
};

/**
 * Pestañas de giro de la galería de Plantillas (A/06b): el mismo icono del
 * asistente para los cinco giros, más transporte y parqueadero (solo aparecen
 * si es el giro de la organización) y «Todas» con la cuadrícula de Plantillas.
 */
export type GiroPlantillaIcono =
  | Exclude<GiroIcono, 'otro'>
  | 'transporte'
  | 'parqueadero'
  | 'todas';

export const ICONO_GIRO_PLANTILLA: Record<GiroPlantillaIcono, LucideIcon> = {
  restaurante: ICONO_GIRO_SITIO.restaurante,
  tienda: ICONO_GIRO_SITIO.tienda,
  hotel: ICONO_GIRO_SITIO.hotel,
  servicios: ICONO_GIRO_SITIO.servicios,
  gimnasio: ICONO_GIRO_SITIO.gimnasio,
  transporte: Truck,
  parqueadero: SquareParking,
  todas: LayoutGrid, // = Plantillas en el menú
};

/**
 * Dispositivos de la vista previa (A/06a, A/06c, A/07g y la barra del editor). El icono
 * dice el dispositivo y la etiqueta, el ancho en px: así se entiende qué se está mirando
 * sin saber qué es «1024». La misma clave que `dispositivos.ts`; `DeviceToggle` (visibilidad
 * por dispositivo) también lee de aquí.
 */
export type DispositivoIcono = DispositivoVista;

export const ICONO_DISPOSITIVO_VISTA: Record<DispositivoIcono, LucideIcon> = {
  escritorio: Monitor,
  portatil: Laptop,
  tableta: Tablet,
  celular: Smartphone,
};

/**
 * Grupos del panel «Estilo del sitio» (Diseño A/06a y el estilo global del
 * editor A/05f) y pestañas de Diseño. Un icono por grupo para que la persona
 * encuentre «los colores» o «la letra» sin leer los títulos.
 */
export type GrupoEstilo = 'presets' | 'colores' | 'tipografia' | 'redondeo' | 'botones' | 'movimiento';

export const ICONO_GRUPO_ESTILO: Record<GrupoEstilo, LucideIcon> = {
  presets: Sparkles,
  colores: Palette,
  tipografia: Type,
  redondeo: SquareRoundCorner,
  botones: RectangleHorizontal,
  movimiento: Activity,
};

/**
 * Pestañas de Diseño (A/06a): Estilo · Encabezado y pie · Logo y favicon. La
 * pestaña «Estilo» es la TAREA estilo (varita, la de la cabecera de Diseño y de
 * la lista de lanzamiento), no el grupo «colores» (paleta) que vive dentro de
 * ella: un icono, un significado.
 */
export const ICONO_PESTANA_DISENO = {
  estilo: ICONO_TAREA_SITIO.estilo,
  'encabezado-pie': ICONO_TAREA_SITIO.encabezado,
  logo: ICONO_TAREA_SITIO.logo,
} as const satisfies Record<string, LucideIcon>;

/**
 * Subtítulos de cabecera que no son un estado de publicación. Plantillas
 * (A/06b): la flecha circular dice «se crea un borrador y se puede volver
 * atrás»; nada cambia en línea hasta publicar.
 */
export const ICONO_SUBTITULO_SITIO = {
  plantillas: RotateCw,
} as const satisfies Record<string, LucideIcon>;

/** Color de un icono suelto según el tono de su estado (texto profundo, pasa AA). */
export const CLASE_ICONO_TONO: Record<TonoBadge, string> = {
  marca: 'text-brand',
  exito: 'text-success-text',
  advertencia: 'text-warning-text',
  peligro: 'text-danger-text',
  informacion: 'text-info-text',
  neutro: 'text-fg-muted',
};

/**
 * Acciones y marcas comunes a varias piezas del módulo (DnsRecordRow, filas,
 * flujos): copiar y su confirmación, abrir la fila, hecho, pendiente e
 * información. Una sola entrada para que «Copiar» se vea igual en la fila DNS
 * del diálogo y en el «⋯» de Dominios.
 */
export const ICONO_ACCION_SITIO = {
  copiar: Copy,
  copiado: Check,
  abrir: ChevronRight,
  hecho: Check,
  correcto: CircleCheck,
  incorrecto: CircleX,
  pendiente: Clock,
  info: Info,
} as const satisfies Record<string, LucideIcon>;

/** Estado de un registro DNS (B/02, B/07-07, 07-21): el icono acompaña al texto del estado. */
export const ICONO_ESTADO_DNS: Record<EstadoRegistroDns, LucideIcon> = {
  pendiente: ICONO_ACCION_SITIO.pendiente,
  correcto: ICONO_ACCION_SITIO.correcto,
  otro_valor: ICONO_ACCION_SITIO.incorrecto,
  no_aparece: ICONO_ACCION_SITIO.pendiente,
  opcional: ICONO_ACCION_SITIO.info,
};
