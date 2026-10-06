/**
 * Reglas del Resumen del sitio web (Figma A/02a-02i): estado de la página
 * (listo o primera vez), lista de lanzamiento, alertas, KPIs y cambios
 * recientes. Puro y sin dependencias de Next ni de Supabase: el servidor
 * (`resumenSitio.server.ts`) reúne los datos y estas funciones deciden; las
 * pruebas las ejercitan sin base.
 *
 * Los textos NO viven aquí: cada paso, alerta o cambio lleva una `clave` de
 * `sitioWeb.resumen.*` y sus valores, y la pantalla los traduce.
 */
import { DIAS_AVISO_VENCIMIENTO } from '@/components/sitio-web/ui/estadoDominio';
import type { AreaCambio } from '@/lib/website/v2/diferenciasDocumento';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { DOMINIO_SITIOS, hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import type { GiroSitio, OpcionDominio } from './onboardingSitio';

export const RUTA_ASISTENTE = `${RAIZ_SITIO_WEB}/primera-configuracion`;

export type EstadoResumen = 'listo' | 'primera_vez';
export type EstadoPaso = 'listo' | 'actual' | 'pendiente';
export type IdPaso = 'plantilla' | 'estilo' | 'datos' | 'carta' | 'catalogo' | 'pagos' | 'dominio' | 'publicar';

/** Texto traducible: clave bajo `sitioWeb.resumen` y sus valores. */
export interface TextoClave {
  clave: string;
  valores?: Record<string, string | number>;
}

export interface PasoLanzamiento {
  id: IdPaso;
  estado: EstadoPaso;
  detalle: TextoClave;
  /** Subpágina que resuelve el paso; `null` en «Publicar» (abre el diálogo). */
  href: string | null;
}

export interface EntradaLanzamiento {
  giro: GiroSitio;
  primeraVez: boolean;
  plantillaId: string | null;
  plantillaNombre?: string | null;
  estiloElegido: boolean;
  /**
   * `confirmados`: la persona revisó los datos en el asistente
   * (`onboarding.pasos.datos`). En «primera vez» el paso solo cuenta como
   * hecho si los confirmó (A/02b: «Ya tenemos tu logo y tu horario»).
   */
  datos: { logo: boolean; nombre: boolean; contacto: boolean; sedePrincipal: string | null; confirmados?: boolean };
  /** Productos activos y categorías activas de Inventario (carta o catálogo). */
  inventario: { productos: number; categorias: number } | null;
  pasarela: boolean;
  dominio: { propio: string | null; opcion: OpcionDominio | null };
  publicacion: { publicado: boolean; cambios: number };
}

/** Paso del asistente que resuelve cada punto de la lista en «primera vez» (A/02b). */
const PASO_ASISTENTE: Partial<Record<IdPaso, number>> = { plantilla: 2, estilo: 3, datos: 4, dominio: 5, publicar: 6 };

const RUTA_PASO: Record<IdPaso, string | null> = {
  plantilla: `${RAIZ_SITIO_WEB}/plantillas`,
  estilo: `${RAIZ_SITIO_WEB}/diseno`,
  datos: `${RAIZ_SITIO_WEB}/configuracion#datos`,
  carta: `${RAIZ_SITIO_WEB}/carta`,
  catalogo: `${RAIZ_SITIO_WEB}/tienda`,
  pagos: `${RAIZ_SITIO_WEB}/ventas`,
  dominio: `${RAIZ_SITIO_WEB}/dominios`,
  publicar: null,
};

/**
 * Lista de lanzamiento (A/02a «5 de 7»): plantilla, estilo, logo y datos, carta
 * (restaurante) o catálogo (tienda) —se omite en otros giros—, pagos, dominio y
 * publicar. El primer paso sin hacer es el «actual».
 */
export function calcularLanzamiento(e: EntradaLanzamiento): PasoLanzamiento[] {
  const pasos: { id: IdPaso; hecho: boolean; detalle: TextoClave }[] = [];

  pasos.push({
    id: 'plantilla',
    hecho: !!e.plantillaId,
    detalle: e.plantillaId
      ? { clave: 'lanzamiento.plantillaListo', valores: { nombre: e.plantillaNombre ?? e.plantillaId } }
      : { clave: 'lanzamiento.plantillaPendiente' },
  });
  pasos.push({
    id: 'estilo',
    hecho: e.estiloElegido,
    detalle: { clave: 'lanzamiento.estiloDetalle' },
  });
  const datosCompletos = e.datos.logo && e.datos.nombre && e.datos.contacto;
  const datosHechos = datosCompletos && (!e.primeraVez || e.datos.confirmados === true);
  pasos.push({
    id: 'datos',
    hecho: datosHechos,
    detalle: !datosHechos && datosCompletos
      ? { clave: 'lanzamiento.datosPorConfirmar' }
      : datosHechos
      ? e.datos.sedePrincipal
        ? { clave: 'lanzamiento.datosListoSede', valores: { sede: e.datos.sedePrincipal } }
        : { clave: 'lanzamiento.datosListo' }
      : !e.datos.logo
        ? { clave: 'lanzamiento.datosFaltaLogo' }
        : { clave: 'lanzamiento.datosFaltaContacto' },
  });
  if (e.giro === 'restaurante' || e.giro === 'tienda') {
    const inv = e.inventario ?? { productos: 0, categorias: 0 };
    const id: IdPaso = e.giro === 'restaurante' ? 'carta' : 'catalogo';
    pasos.push({
      id,
      hecho: inv.productos > 0,
      detalle:
        inv.productos > 0
          ? { clave: `lanzamiento.${id}Listo`, valores: { productos: inv.productos, categorias: inv.categorias } }
          : { clave: `lanzamiento.${id}Pendiente` },
    });
  }
  pasos.push({
    id: 'pagos',
    hecho: e.pasarela,
    detalle: e.pasarela
      ? { clave: 'lanzamiento.pagosListo' }
      : e.primeraVez
        ? { clave: 'lanzamiento.pagosOpcional' }
        : { clave: 'lanzamiento.pagosPendiente' },
  });
  const dominioHecho = !!e.dominio.propio || e.dominio.opcion === 'gratis';
  pasos.push({
    id: 'dominio',
    hecho: dominioHecho,
    detalle: e.dominio.propio
      ? { clave: 'lanzamiento.dominioPropio', valores: { host: e.dominio.propio } }
      : dominioHecho
        ? { clave: 'lanzamiento.dominioGratis' }
        : { clave: 'lanzamiento.dominioPendiente' },
  });
  const publicadoAlDia = e.publicacion.publicado && e.publicacion.cambios === 0;
  pasos.push({
    id: 'publicar',
    hecho: publicadoAlDia,
    detalle: publicadoAlDia
      ? { clave: 'lanzamiento.publicarListo' }
      : e.publicacion.cambios > 0 && e.publicacion.publicado
        ? { clave: 'lanzamiento.publicarCambios', valores: { n: e.publicacion.cambios } }
        : { clave: 'lanzamiento.publicarNunca' },
  });

  let actualAsignado = false;
  return pasos.map(({ id, hecho, detalle }) => {
    let estado: EstadoPaso = 'listo';
    if (!hecho) {
      estado = actualAsignado ? 'pendiente' : 'actual';
      actualAsignado = true;
    }
    const paso = PASO_ASISTENTE[id];
    const href = e.primeraVez && paso ? `${RUTA_ASISTENTE}?paso=${paso}` : RUTA_PASO[id];
    return { id, estado, detalle, href };
  });
}

// ─── Estado de la página ──────────────────────────────────────────────────────────────────

export interface EntradaEstado {
  /** Hay una revisión V2 publicada. */
  revisionPublicada: boolean;
  onboardingCompletado: boolean;
  /**
   * `fn_inicio_tienda_web.activa`: el sitio tuvo alguna vez visitas o pedidos.
   * `null` = no se pudo saber (sin acceso a ventas): se trata como sitio en uso.
   */
  sitioConTrafico: boolean | null;
}

/**
 * «Primera vez» (A/02b) solo si el sitio nunca se publicó en V2, el asistente no
 * se terminó y el sitio nunca tuvo tráfico. Así las organizaciones con un sitio
 * legacy que ya vende no ven «Tu sitio está a 6 pasos de estar en línea».
 */
export function decidirEstado(e: EntradaEstado): EstadoResumen {
  if (e.revisionPublicada || e.onboardingCompletado) return 'listo';
  return e.sitioConTrafico === false ? 'primera_vez' : 'listo';
}

// ─── Alertas ─────────────────────────────────────────────────────────────────────────────

export type TonoAlerta = 'peligro' | 'advertencia' | 'informacion';

export interface AlertaSitio {
  id: string;
  tono: TonoAlerta;
  titulo: TextoClave;
  descripcion: TextoClave;
  accion: { etiqueta: TextoClave; href: string };
}

export interface DominioAlerta {
  id: string;
  host: string;
  domain_type: string;
  status: string;
  is_active: boolean;
  vercel_state?: unknown;
  metadata?: unknown;
  /** Columna propuesta por el área dominios; hoy viene de `metadata.expires_at` si existe. */
  expires_at?: string | null;
}

const ORDEN_TONO: Record<TonoAlerta, number> = { peligro: 0, advertencia: 1, informacion: 2 };
const MS_DIA = 86_400_000;

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

/** Días hasta el vencimiento (redondeados hacia arriba) o `null` si no se conoce. */
export function diasParaVencer(d: DominioAlerta, ahora: Date): number | null {
  const crudo = d.expires_at ?? objeto(d.metadata).expires_at;
  if (typeof crudo !== 'string') return null;
  const t = Date.parse(crudo);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - ahora.getTime()) / MS_DIA);
}

const PROPIOS = new Set(['custom_domain', 'www_alias', 'custom_subdomain']);

/**
 * Alertas en orden peligro > advertencia > información (nota A/02h):
 * dominio mal configurado, dominio por vencer con renovación apagada y «aún no
 * recibes pagos en línea». Sin fecha de vencimiento conocida, esa alerta no se
 * calcula (no se inventa).
 */
export function calcularAlertas(entrada: { dominios: readonly DominioAlerta[]; pasarela: boolean; venderEnLinea: boolean; ahora: Date }): AlertaSitio[] {
  const alertas: AlertaSitio[] = [];
  for (const d of entrada.dominios) {
    if (!d.is_active || !PROPIOS.has(d.domain_type)) continue;
    const ruta = `${RAIZ_SITIO_WEB}/dominios/${encodeURIComponent(d.id)}`;
    const vercelMal = objeto(d.vercel_state).verified === false;
    if (['failed', 'pending', 'verifying'].includes(d.status) || vercelMal) {
      alertas.push({
        id: `dominio-mal-${d.id}`,
        tono: 'peligro',
        titulo: { clave: 'alertas.malConfiguradoTitulo', valores: { host: d.host } },
        descripcion: { clave: d.status === 'verifying' ? 'alertas.verificandoDescripcion' : 'alertas.malConfiguradoDescripcion' },
        accion: { etiqueta: { clave: 'alertas.verDns' }, href: ruta },
      });
      continue;
    }
    const dias = diasParaVencer(d, entrada.ahora);
    const autoRenovar = objeto(d.metadata).auto_renew === true;
    if (dias !== null && dias <= DIAS_AVISO_VENCIMIENTO && !autoRenovar) {
      alertas.push({
        id: `dominio-vence-${d.id}`,
        tono: dias < 0 ? 'peligro' : 'advertencia',
        titulo:
          dias < 0
            ? { clave: 'alertas.vencidoTitulo', valores: { host: d.host } }
            : dias === 1
              ? { clave: 'alertas.venceUnDiaTitulo', valores: { host: d.host } }
              : { clave: 'alertas.venceTitulo', valores: { host: d.host, n: Math.max(dias, 0) } },
        descripcion: { clave: 'alertas.venceDescripcion' },
        accion: { etiqueta: { clave: 'alertas.renovar' }, href: ruta },
      });
    }
  }
  if (!entrada.pasarela && entrada.venderEnLinea) {
    alertas.push({
      id: 'sin-pasarela',
      tono: 'informacion',
      titulo: { clave: 'alertas.sinPasarelaTitulo' },
      descripcion: { clave: 'alertas.sinPasarelaDescripcion' },
      accion: { etiqueta: { clave: 'alertas.conectarPasarela' }, href: `${RAIZ_SITIO_WEB}/ventas` },
    });
  }
  return alertas.sort((a, b) => ORDEN_TONO[a.tono] - ORDEN_TONO[b.tono]);
}

// ─── KPIs ────────────────────────────────────────────────────────────────────────────────

export type DisponibilidadKpis = 'si' | 'sin_acceso' | 'sin_publicar';

export interface KpisSitio {
  disponible: DisponibilidadKpis;
  /** Visitantes de los últimos 7 días (la misma métrica que la tarjeta «Tienda web» del inicio). */
  visitas: number | null;
  visitasAnterior: number | null;
  pedidos: number | null;
  /** `null` si el giro no es restaurante (no hay reservas web que contar). */
  reservas: number | null;
  /** (pedidos + reservas) / visitantes, entre 0 y 1; `null` sin visitas. */
  conversion: number | null;
  hrefPedidos: string | null;
  hrefReservas: string | null;
  hrefAnalitica: string | null;
}

export function calcularConversion(pedidos: number, reservas: number | null, visitas: number): number | null {
  if (!(visitas > 0)) return null;
  return Math.min(1, Math.max(0, (pedidos + (reservas ?? 0)) / visitas));
}

/** Variación porcentual de visitas frente a la semana anterior (`null` sin base). */
export function variacionVisitas(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || anterior <= 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

// ─── Cambios recientes ───────────────────────────────────────────────────────────────────

export interface CambioReciente {
  id: string;
  tipo: 'publicado' | 'borrador';
  texto: TextoClave;
  en: string;
  autor: string | null;
}

export interface EntradaCambios {
  revisiones: readonly { id: string; numero: number; nota: string | null; publicadaEn: string; autor: string | null; cambios: number | null }[];
  borrador: { actualizadoEn: string; autor: string | null; cambiosSinPublicar: number; areas: readonly AreaCambio[] } | null;
  limite?: number;
}

/**
 * «Cambios recientes» (A/02a): la última edición del borrador si tiene cambios
 * sin publicar («Guardado en borrador») y las publicaciones («Publicó N
 * cambios»), de la más reciente a la más antigua. El detalle por edición
 * («Editó «Carta destacada» en Inicio») necesita el registro de cambios
 * propuesto en supabase/pendientes; sin él se nombra la primera área cambiada.
 */
export function armarCambios(e: EntradaCambios): CambioReciente[] {
  const lista: CambioReciente[] = [];
  if (e.borrador && e.borrador.cambiosSinPublicar > 0) {
    const area = e.borrador.areas[0];
    lista.push({
      id: 'borrador',
      tipo: 'borrador',
      texto: !area
        ? { clave: 'cambios.editoBorrador' }
        : area.tipo === 'pagina'
          ? { clave: 'cambios.editoPagina', valores: { pagina: area.titulo } }
          : { clave: `cambios.edito_${area.tipo}` },
      en: e.borrador.actualizadoEn,
      autor: e.borrador.autor,
    });
  }
  for (const r of e.revisiones) {
    lista.push({
      id: r.id,
      tipo: 'publicado',
      texto: r.nota
        ? { clave: 'cambios.publicoNota', valores: { nota: r.nota } }
        : r.cambios && r.cambios > 0
          ? { clave: r.cambios === 1 ? 'cambios.publicoUno' : 'cambios.publicoN', valores: { n: r.cambios } }
          : { clave: 'cambios.publicoVersion', valores: { n: r.numero } },
      en: r.publicadaEn,
      autor: r.autor,
    });
  }
  return lista.sort((a, b) => Date.parse(b.en) - Date.parse(a.en)).slice(0, e.limite ?? 4);
}

/** Fila de `website_site_change_events` (migración pendiente 20261007120000). */
export interface EventoCambio {
  id: string;
  tipo: 'borrador_guardado' | 'publicado' | 'restaurado';
  resumen: unknown;
  creadoEn: string;
  autor: string | null;
}

const AREAS_GLOBALES = new Set(['tema', 'identidad', 'seo', 'contenido', 'menus', 'shell']);

/**
 * «Cambios recientes» con el detalle por edición (A/02a: «Editó «Carta
 * destacada» en Inicio», «Publicó 4 cambios») cuando existe el registro de
 * cambios. Lee el `resumen` sin confiar en su forma.
 */
export function cambiosDesdeEventos(eventos: readonly EventoCambio[], limite = 4): CambioReciente[] {
  return eventos.slice(0, limite).map((e) => {
    const r = objeto(e.resumen);
    const paginas = (Array.isArray(r.paginas) ? r.paginas : []).map(objeto).filter((p) => typeof p.titulo === 'string') as { titulo: string }[];
    const areas = (Array.isArray(r.areas) ? r.areas : []).filter((a): a is string => typeof a === 'string' && AREAS_GLOBALES.has(a));
    const total = paginas.length + areas.length;
    let texto: TextoClave;
    if (e.tipo === 'publicado' || e.tipo === 'restaurado') {
      texto =
        e.tipo === 'restaurado'
          ? { clave: 'cambios.restauro' }
          : total === 1
            ? { clave: 'cambios.publicoUno' }
            : total > 1
              ? { clave: 'cambios.publicoN', valores: { n: total } }
              : { clave: 'cambios.publicoVersion', valores: { n: Number(r.revision_number) || 1 } };
    } else if (paginas[0]) {
      texto = { clave: 'cambios.editoPagina', valores: { pagina: paginas[0].titulo } };
    } else if (areas[0]) {
      texto = { clave: `cambios.edito_${areas[0]}` };
    } else {
      texto = { clave: 'cambios.editoBorrador' };
    }
    return { id: e.id, tipo: e.tipo === 'borrador_guardado' ? 'borrador' : 'publicado', texto, en: e.creadoEn, autor: e.autor };
  });
}

// ─── Respuesta del endpoint ──────────────────────────────────────────────────────────────

export interface SitioDelResumen {
  /** `website_site_states.id` del sitio principal V2, si existe. */
  v2Id: string | null;
  versionBorrador: number | null;
  origen: 'v2' | 'legacy';
  host: string | null;
  url: string | null;
  /** `tu-marca.goadmin.io` cuando el host principal es un dominio propio («también responde en…»). */
  subdominioHost: string | null;
  hostEsPropio: boolean;
  nombre: string;
  plantillaId: string | null;
  ultimaPublicacion: { en: string; autor: string | null } | null;
  publicado: boolean;
  cambiosSinPublicar: { cantidad: number; areas: AreaCambio[] };
  paginaInicioId: string | null;
}

export interface ResumenSitioRespuesta {
  estado: EstadoResumen;
  giro: GiroSitio;
  typeId: number | null;
  sitio: SitioDelResumen;
  lanzamiento: PasoLanzamiento[];
  kpis: KpisSitio;
  alertas: AlertaSitio[];
  cambios: CambioReciente[];
  permisos: { editar: boolean; publicar: boolean };
  onboarding: { pasoActual: number | null; iniciado: boolean };
}

// ─── Dirección y pagos (compartidos por el Resumen y el asistente) ───────────────────────

export interface DireccionSitio {
  host: string | null;
  url: string | null;
  /** El subdominio del sistema cuando el host principal es propio. */
  subdominioHost: string | null;
  hostEsPropio: boolean;
}

/**
 * Dirección pública: el dominio que fijó la persona (`primary_domain_id`) si
 * sigue verificado y activo; si no, la regla única de `hostSitio` (dominio
 * propio principal verificado o el subdominio).
 */
export function direccionSitio(
  dominios: readonly (DominioDelSitio & { id: string })[],
  subdominio: string | null,
  primaryDomainId: string | null | undefined,
): DireccionSitio {
  const fijado = primaryDomainId ? dominios.find((d) => d.id === primaryDomainId && d.status === 'verified' && d.is_active) : undefined;
  const host = fijado?.host ?? hostSitio(dominios, subdominio);
  const sub = subdominio ? `${subdominio}.${DOMINIO_SITIOS}` : null;
  const hostEsPropio = !!host && host !== sub;
  return { host, url: host ? `https://${host}` : null, subdominioHost: hostEsPropio ? sub : null, hostEsPropio };
}

/** ¿Hay una pasarela conectada y visible en el sitio? (`organization_payment_methods`). */
export function tienePasarela(pagos: readonly { integration_connection_id: string | null; show_on_website: boolean | null; is_active: boolean | null }[]): boolean {
  return pagos.some((p) => p.is_active !== false && p.show_on_website === true && !!p.integration_connection_id);
}
