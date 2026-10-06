/**
 * Iconos de «SEO y redes» y de «Píxeles y medición», en un solo lugar
 * (Figma B/08 y B/09; Manual de marca v2.0 §5; docs/design/CATALOGO-ICONOS.md).
 * Extiende la tabla del módulo (`../ui/iconosSitio`): misma escala de tamaños
 * (14 · 16 · 20 · caja de 40), trazo de 1,5 y la regla de que el icono
 * acompaña al texto y nunca lo reemplaza (siempre `aria-hidden`).
 *
 * Por qué una tabla: el dueño pidió que se entienda «por el icono». Para eso,
 * el MISMO canal lleva el MISMO icono en el formulario de redes, en las
 * pestañas de la vista previa, en «De dónde llegan» de Analítica y en la
 * tarjeta del píxel: quien reconoce la cámara como Instagram la reconoce en
 * las cuatro. Ningún archivo del área elige su icono por su cuenta.
 *
 * Sin logos de marca: lucide los retiró (`Facebook`, `Instagram` están
 * obsoletos y salen en la v1). Se usa un icono genérico que evoca el canal.
 */
import {
  Bot,
  Camera,
  ChartColumnIncreasing,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  Globe,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  Keyboard,
  Link2,
  ListChecks,
  Map as MapIcon,
  MapPinned,
  Megaphone,
  MessageSquare,
  Music2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  SearchCheck,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Tags,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ICONO_TAREA_SITIO } from '../ui/iconosSitio';
import type { TipoPixel } from './saludSitio';

/** Iconos de página: los MISMOS de su entrada de menú (catalog.ts). */
export const ICONO_PAGINA_SEO: LucideIcon = ICONO_TAREA_SITIO.seo;
export const ICONO_PAGINA_ANALITICA: LucideIcon = ICONO_TAREA_SITIO.analitica;

/**
 * Secciones de «SEO y redes» (B/08-01): el mismo icono en la cabecera de la
 * sección de escritorio, en la fila del móvil y en el título de su hoja.
 */
export const ICONO_SECCION_SEO = {
  titulo: FileText,
  imagen: ImageIcon,
  redes: Share2,
  google: Globe,
  vista: Eye,
  calidad: ListChecks,
} as const satisfies Record<string, LucideIcon>;
export type SeccionSeoIcono = keyof typeof ICONO_SECCION_SEO;

/**
 * Canales (redes, vista previa y fuentes de tráfico). Google = lupa (buscar);
 * Instagram = cámara; Facebook = pulgar arriba; TikTok = nota musical;
 * WhatsApp = «Aviso al cliente · mensajería» del catálogo; Directo = alguien
 * escribió la dirección; Otros = puntos suspensivos.
 */
export const ICONO_CANAL = {
  google: Search,
  instagram: Camera,
  facebook: ThumbsUp,
  tiktok: Music2,
  whatsapp: MessageSquare,
  directo: Keyboard,
  otros: Ellipsis,
} as const satisfies Record<string, LucideIcon>;
export type CanalIcono = keyof typeof ICONO_CANAL;

/** Salud del sitio en solo lectura (B/08-01 «Google»): mapa, robot y eslabón (= dominio principal). */
export const ICONO_SALUD_SEO = {
  sitemap: MapIcon,
  robots: Bot,
  canonica: Link2,
} as const satisfies Record<string, LucideIcon>;

/** Filas de «Google» (B/08-01). Ocultar = el ojo tachado de «Sin publicar»: nadie lo ve. */
export const ICONO_GOOGLE_SEO = {
  searchConsole: SearchCheck,
  perfil: MapPinned,
  ocultar: EyeOff,
  /** Solo dice que el código está guardado (no que Google lo verificó): disquete, no escudo. */
  codigoGuardado: Save,
} as const satisfies Record<string, LucideIcon>;

/**
 * Nivel de un campo o de un contador (título, descripción, imagen, calidad):
 * check = bien, círculo con «!» = mejorable o largo, círculo con X = falta.
 * El color sale del tono del badge o del contador, no de aquí.
 */
export type NivelIcono = 'bien' | 'mejorable' | 'falta';
export const ICONO_NIVEL: Record<NivelIcono, LucideIcon> = {
  bien: CircleCheck,
  mejorable: CircleAlert,
  falta: CircleX,
};

/**
 * Acciones del área. Una acción = un icono, esté en la cabecera, en el «⋯»,
 * en una tarjeta o en un diálogo (catálogo §8.2: Editar = lápiz, Descargar y
 * exportar = flecha abajo, Copiar = dos hojas, Quitar = papelera).
 */
export const ICONO_ACCION_SEO = {
  guardar: Save,
  actualizar: RefreshCw,
  abrirFuera: ExternalLink,
  sugerirIa: Sparkles,
  escribir: Pencil,
  corregir: Pencil,
  agregar: Plus,
  cambiarImagen: RefreshCw,
  quitar: X,
  principal: Star,
  robots: Bot,
  catalogos: ShoppingBag,
  copiarEnlace: Copy,
  exportar: Download,
  conectar: Plus,
  probar: FlaskConical,
  cambiar: Pencil,
  desconectar: Trash2,
} as const satisfies Record<string, LucideIcon>;

/**
 * Píxeles (B/09-01). Meta = infinito (la forma de su logo, sin usarlo);
 * GA4 = columnas que suben (medición, distinto del `BarChart3` de la página);
 * TikTok = la nota de su canal; GTM = etiquetas; Google Ads = megáfono.
 */
export const ICONO_PIXEL = {
  meta: InfinityIcon,
  ga4: ChartColumnIncreasing,
  tiktok: ICONO_CANAL.tiktok,
  gtm: Tags,
  ads: Megaphone,
} as const satisfies Record<TipoPixel, LucideIcon>;
