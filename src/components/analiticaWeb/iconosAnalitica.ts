/**
 * Iconos de la analítica web (Figma B/09-01, B/09-02 y E-analitica), en un
 * solo lugar. Extiende la tabla del módulo Sitio web (`iconosSitio`): las
 * cifras que también salen en el Resumen (visitas, pedidos, conversión) usan
 * EXACTAMENTE el mismo icono (`ICONO_KPI_SITIO`), y los canales de «De dónde
 * llegan» usan los de SEO y redes (`ICONO_CANAL`). Escala de 14 · 16 · 20,
 * trazo 1,5; el icono acompaña al texto y nunca lo reemplaza.
 */
import { ArrowLeft, Building2, ChartLine, Compass, Earth, Flag, Footprints, Funnel, LandPlot, MapPin, Receipt, Target, type LucideIcon } from 'lucide-react';
import { ICONO_KPI_SITIO, ICONO_TAREA_SITIO } from '@/components/sitio-web/ui/iconosSitio';
import { ICONO_ACCION_SEO, ICONO_CANAL } from '@/components/sitio-web/seoanalitica/iconosSeoAnalitica';
import type { FuenteTrafico } from '@/lib/analiticaWeb/trafico';

/**
 * KPIs (B/09-01): visitantes, pedidos y conversión = los del Resumen;
 * sesiones = huellas (un recorrido por el sitio); venta media = «Venta ·
 * comprobante» del catálogo de iconos.
 */
export const ICONO_KPI_ANALITICA = {
  visitantes: ICONO_KPI_SITIO.visitas,
  sesiones: Footprints,
  pedidos: ICONO_KPI_SITIO.pedidos,
  conversion: ICONO_KPI_SITIO.conversion,
  ventaMedia: Receipt,
} as const satisfies Record<string, LucideIcon>;

/** Bloques de la página: uno por tarjeta, en escritorio y en móvil. */
export const ICONO_BLOQUE_ANALITICA = {
  embudo: Funnel,
  grafico: ChartLine,
  fuentes: Compass,
  paginas: ICONO_TAREA_SITIO.paginas,
  pedido: ICONO_KPI_SITIO.pedidos,
  reserva: ICONO_KPI_SITIO.reservas,
  pixeles: Target,
  geo: Earth,
} as const satisfies Record<string, LucideIcon>;

/**
 * «De dónde entran» (B/09-01 y B/09-02): una tarjeta = un icono, de lo más
 * amplio a lo más concreto (mundo → país → departamento → ciudad). El alfiler
 * marca las visitas sin ubicación. Volver = flecha a la izquierda y quitar el
 * filtro = la misma X de «Quitar» en SEO y redes.
 */
export const ICONO_GEO_ANALITICA = {
  mundo: Earth,
  pais: Flag,
  region: LandPlot,
  ciudad: Building2,
  sinUbicacion: MapPin,
  volver: ArrowLeft,
  quitarFiltro: ICONO_ACCION_SEO.quitar,
} as const satisfies Record<string, LucideIcon>;

/** Fuente de tráfico → el icono de su canal (el mismo de SEO y redes). */
export const ICONO_FUENTE_TRAFICO: Record<FuenteTrafico, LucideIcon> = {
  google: ICONO_CANAL.google,
  instagram: ICONO_CANAL.instagram,
  whatsapp: ICONO_CANAL.whatsapp,
  directo: ICONO_CANAL.directo,
  facebook: ICONO_CANAL.facebook,
  tiktok: ICONO_CANAL.tiktok,
  otros: ICONO_CANAL.otros,
};
