/**
 * Filtros de Integraciones › Conexiones, en la URL como en las demás listas del ERP
 * (`useListadoServidor`: `q`, `pagina`, `tamano` y las claves de abajo). Módulo puro: qué claves
 * admite cada pestaña, qué chips se pintan y cómo se filtra lo ya cargado. Sin React.
 *
 * Catálogo: `grupo` (chips bajo las pestañas, 85-00) y `estado` del servicio.
 * Mis conexiones: `estado`, `grupo` y `atencion=1`.
 * Actividad: `conexion`, `errores=1`, `periodo=hoy` (chips rápidos, 85-14), `estado`, `sentido`,
 * `periodo` (hoy | 7d | 30d), `webhooks=1` (solo los que llegaron por webhook) y `pruebas=1` (solo
 * pruebas de conexión) — panel «Filtros» de 85-57.
 * Desarrolladores: `estado` (activas | revocadas) de las llaves.
 */
import type { ChipFiltro } from '@/components/kit';
import type { ConexionResumen, ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';
import type { EstadoCatalogo, GrupoCatalogo } from '@/lib/services/integrations/conexiones/catalogoConexiones';
import { estadoConexion } from './presentacion';

export const PESTANAS = ['catalogo', 'mis', 'actividad', 'desarrolladores'] as const;
export type Pestana = (typeof PESTANAS)[number];

/** Claves de filtro admitidas en la URL (unión de todas las pestañas). */
export const FILTROS_URL = ['grupo', 'estado', 'atencion', 'conexion', 'errores', 'periodo', 'sentido', 'webhooks', 'pruebas'] as const;

/** Claves del listado que se limpian al cambiar de pestaña (los filtros son de cada una). */
export const CLAVES_A_LIMPIAR: Record<string, null> = Object.fromEntries([...FILTROS_URL, 'q', 'pagina', 'tamano', 'evento'].map((k) => [k, null]));

export const ESTADOS_CATALOGO_FILTRO: readonly EstadoCatalogo[] = ['conectado', 'disponible', 'revisar', 'en_construccion'];
export const ESTADOS_CONEXION_FILTRO = ['activa', 'conErrores', 'revisar', 'pausada', 'borrador'] as const;
export const ESTADOS_EVENTO_FILTRO = ['processed', 'error', 'received'] as const;
export const SENTIDOS_FILTRO = ['inbound', 'outbound'] as const;
export const PERIODOS_FILTRO = ['hoy', '7d', '30d'] as const;
export const ESTADOS_LLAVE_FILTRO = ['activas', 'revocadas'] as const;

export type Filtros = Readonly<Record<string, string>>;

const incluye = (lista: readonly string[], v: string | undefined): boolean => !!v && lista.includes(v);

/** Filtro de grupo válido o «todos». */
export function grupoDeUrl(f: Filtros): GrupoCatalogo | 'todos' {
  const g = f.grupo;
  return g && (['cobros', 'hospedaje', 'domicilios', 'publicidad', 'mensajeria', 'envios', 'go_admin'] as readonly string[]).includes(g) ? (g as GrupoCatalogo) : 'todos';
}

/** Catálogo: filtra por estado del servicio (el grupo y el texto los aplica `filtrarCatalogo`). */
export function filtrarCatalogoPorEstado(items: readonly ItemCatalogo[], f: Filtros): ItemCatalogo[] {
  if (!incluye(ESTADOS_CATALOGO_FILTRO, f.estado)) return [...items];
  return items.filter((i) => i.estado === f.estado);
}

/** Mis conexiones: estado, grupo (por el proveedor en el catálogo), «necesita atención» y texto. */
export function filtrarConexiones(
  conexiones: readonly ConexionResumen[],
  f: Filtros,
  busqueda: string,
  grupoDe: (proveedor: string) => GrupoCatalogo | null,
): ConexionResumen[] {
  const q = busqueda.trim().toLocaleLowerCase('es');
  const grupo = grupoDeUrl(f);
  return conexiones.filter((c) => {
    if (incluye(ESTADOS_CONEXION_FILTRO, f.estado) && estadoConexion(c.estado, c.necesitaAtencion).clave !== f.estado) return false;
    if (grupo !== 'todos' && grupoDe(c.proveedor) !== grupo) return false;
    if (f.atencion === '1' && !c.necesitaAtencion) return false;
    if (q && !`${c.nombre} ${c.proveedorNombre} ${c.proveedor}`.toLocaleLowerCase('es').includes(q)) return false;
    return true;
  });
}

export type FiltroRapidoActividad = 'todas' | 'errores' | 'hoy' | `c:${string}`;

/** Chip rápido de Actividad (85-14) que corresponde a la URL. */
export function filtroRapidoDeUrl(f: Filtros): FiltroRapidoActividad {
  if (f.errores === '1') return 'errores';
  if (f.periodo === 'hoy') return 'hoy';
  if (f.conexion) return `c:${f.conexion}`;
  return 'todas';
}

/** Cambios de URL al elegir un chip rápido de Actividad (los chips son excluyentes entre sí). */
export function cambiosPorFiltroRapido(v: FiltroRapidoActividad): Record<string, string | null> {
  return {
    errores: v === 'errores' ? '1' : null,
    periodo: v === 'hoy' ? 'hoy' : null,
    conexion: v.startsWith('c:') ? v.slice(2) : null,
  };
}

/** Desarrolladores: llaves por estado (`activas` oculta las revocadas, como la página vieja). */
export function filtrarLlaves<T extends { nombre: string; mascara: string; activa: boolean; revocada: string | null }>(llaves: readonly T[], f: Filtros, busqueda: string): T[] {
  const q = busqueda.trim().toLocaleLowerCase('es');
  return llaves.filter((k) => {
    if (f.estado === 'activas' && k.revocada) return false;
    if (f.estado === 'revocadas' && !k.revocada) return false;
    if (q && !`${k.nombre} ${k.mascara}`.toLocaleLowerCase('es').includes(q)) return false;
    return true;
  });
}

export function filtrarWebhooks<T extends { nombre: string; url: string }>(webhooks: readonly T[], busqueda: string): T[] {
  const q = busqueda.trim().toLocaleLowerCase('es');
  if (!q) return [...webhooks];
  return webhooks.filter((w) => `${w.nombre} ${w.url}`.toLocaleLowerCase('es').includes(q));
}

export interface TextosChips {
  /** `t('filtros.chips.<clave>', { valor })`. */
  chip: (clave: string, valor?: string) => string;
  /** Etiqueta legible de un valor de filtro (`estado`, `grupo`, `sentido`…). */
  valor: (clave: string, v: string) => string;
  nombreConexion: (id: string) => string;
}

/** Chips de filtros activos de la pestaña, en el orden en que se ven en el panel. */
export function chipsDeFiltros(tab: Pestana, f: Filtros, x: TextosChips): ChipFiltro[] {
  const chips: ChipFiltro[] = [];
  const agregar = (clave: string, etiqueta: string) => chips.push({ clave, etiqueta });
  if (tab === 'catalogo') {
    if (grupoDeUrl(f) !== 'todos') agregar('grupo', x.chip('grupo', x.valor('grupo', f.grupo)));
    if (incluye(ESTADOS_CATALOGO_FILTRO, f.estado)) agregar('estado', x.chip('estado', x.valor('estadoCatalogo', f.estado)));
  } else if (tab === 'mis') {
    if (incluye(ESTADOS_CONEXION_FILTRO, f.estado)) agregar('estado', x.chip('estado', x.valor('estadoConexion', f.estado)));
    if (grupoDeUrl(f) !== 'todos') agregar('grupo', x.chip('grupo', x.valor('grupo', f.grupo)));
    if (f.atencion === '1') agregar('atencion', x.chip('atencion'));
  } else if (tab === 'actividad') {
    if (f.conexion) agregar('conexion', x.chip('conexion', x.nombreConexion(f.conexion)));
    if (f.errores === '1') agregar('errores', x.chip('errores'));
    if (incluye(ESTADOS_EVENTO_FILTRO, f.estado)) agregar('estado', x.chip('resultado', x.valor('estadoEvento', f.estado)));
    if (incluye(SENTIDOS_FILTRO, f.sentido)) agregar('sentido', x.chip('sentido', x.valor('sentido', f.sentido)));
    if (incluye(PERIODOS_FILTRO, f.periodo)) agregar('periodo', x.chip('periodo', x.valor('periodo', f.periodo)));
    if (f.webhooks === '1') agregar('webhooks', x.chip('webhooks'));
    if (f.pruebas === '1') agregar('pruebas', x.chip('pruebas'));
  } else if (incluye(ESTADOS_LLAVE_FILTRO, f.estado)) {
    agregar('estado', x.chip('estado', x.valor('estadoLlave', f.estado)));
  }
  return chips;
}

/** Texto del buscador según la pestaña (clave i18n). */
export function clavePlaceholderBusqueda(tab: Pestana): string {
  return tab === 'catalogo' ? 'catalogo.buscar' : tab === 'actividad' ? 'actividad.buscar' : tab === 'desarrolladores' ? 'desarrolladores.buscar' : 'misConexiones.buscar';
}
