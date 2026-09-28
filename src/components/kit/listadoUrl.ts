/**
 * Estado de un listado paginado en el servidor, guardado en la URL.
 *
 * Búsqueda, filtros, orden, página y tamaño viven en `searchParams` para que
 * el listado sobreviva a recargar, se pueda compartir el enlace y «atrás»
 * funcione. Con 34.000 leads o 18.000 clientes no se puede traer todo y
 * filtrar en el navegador: el estado de la URL es lo que se manda al servidor.
 *
 * Todo lo que se lee de la URL se valida contra la configuración del listado:
 * un campo de orden o un filtro que no está en la lista blanca se descarta,
 * porque después termina en un `.order()` o un `.eq()` de Supabase.
 */
import { TAMANOS_PAGINA } from './paginacion';

export type DireccionOrden = 'asc' | 'desc';

export interface OrdenListado {
  campo: string;
  direccion: DireccionOrden;
}

export interface ConfigListado {
  /** Claves de filtro admitidas en la URL (p. ej. `['estado', 'tipo']`). */
  filtros?: readonly string[];
  /** Campos por los que se puede ordenar. Sin lista, no se admite orden por URL. */
  camposOrden?: readonly string[];
  ordenPorDefecto?: OrdenListado | null;
  tamanoPorDefecto?: number;
  tamanosPermitidos?: readonly number[];
  /** Prefijo de las claves, para dos listados en la misma página (`'prov_'`). */
  prefijo?: string;
}

export interface EstadoListado {
  busqueda: string;
  /** Solo filtros con valor. Los multivalor van separados por coma. */
  filtros: Record<string, string>;
  orden: OrdenListado | null;
  pagina: number;
  tamano: number;
}

/** Lo mínimo de `URLSearchParams` que se necesita (lo cumple `ReadonlyURLSearchParams`). */
export interface LectorParams {
  get(clave: string): string | null;
}

export const LARGO_MAXIMO_BUSQUEDA = 200;

const CLAVES = { busqueda: 'q', pagina: 'pagina', tamano: 'tamano', orden: 'orden', direccion: 'dir' } as const;

export function tamanoPorDefecto(config: ConfigListado): number {
  const permitidos = config.tamanosPermitidos ?? TAMANOS_PAGINA;
  const t = config.tamanoPorDefecto ?? 20;
  return permitidos.includes(t) ? t : permitidos[0];
}

export function estadoInicial(config: ConfigListado): EstadoListado {
  return {
    busqueda: '',
    filtros: {},
    orden: config.ordenPorDefecto ?? null,
    pagina: 1,
    tamano: tamanoPorDefecto(config),
  };
}

export function leerEstadoListado(params: LectorParams | null | undefined, config: ConfigListado): EstadoListado {
  const base = estadoInicial(config);
  if (!params) return base;
  const k = (c: string) => `${config.prefijo ?? ''}${c}`;

  const busqueda = (params.get(k(CLAVES.busqueda)) ?? '').trim().slice(0, LARGO_MAXIMO_BUSQUEDA);

  const filtros: Record<string, string> = {};
  for (const clave of config.filtros ?? []) {
    const valor = params.get(k(clave))?.trim();
    if (valor) filtros[clave] = valor.slice(0, LARGO_MAXIMO_BUSQUEDA);
  }

  let orden = base.orden;
  const campo = params.get(k(CLAVES.orden));
  if (campo && (config.camposOrden ?? []).includes(campo)) {
    orden = { campo, direccion: params.get(k(CLAVES.direccion)) === 'desc' ? 'desc' : 'asc' };
  }

  const permitidos = config.tamanosPermitidos ?? TAMANOS_PAGINA;
  const tamanoUrl = Number(params.get(k(CLAVES.tamano)));
  const tamano = permitidos.includes(tamanoUrl) ? tamanoUrl : base.tamano;

  const paginaUrl = Number(params.get(k(CLAVES.pagina)));
  const pagina = Number.isInteger(paginaUrl) && paginaUrl >= 1 ? paginaUrl : 1;

  return { busqueda, filtros, orden, pagina, tamano };
}

/**
 * Escribe el estado sobre los parámetros actuales. Conserva las claves que no
 * son del listado (pestañas, ids abiertos) y omite los valores por defecto para
 * que la URL quede corta.
 */
export function escribirEstadoListado(
  estado: EstadoListado,
  config: ConfigListado,
  actuales?: string | URLSearchParams | null,
): URLSearchParams {
  const salida = new URLSearchParams(actuales ? actuales.toString() : '');
  const k = (c: string) => `${config.prefijo ?? ''}${c}`;
  const fijar = (clave: string, valor: string | null) => {
    if (valor === null || valor === '') salida.delete(k(clave));
    else salida.set(k(clave), valor);
  };

  const inicial = estadoInicial(config);
  fijar(CLAVES.busqueda, estado.busqueda.trim() || null);
  for (const clave of config.filtros ?? []) fijar(clave, estado.filtros[clave] ?? null);

  const ordenIgual =
    (estado.orden === null && inicial.orden === null) ||
    (estado.orden !== null &&
      inicial.orden !== null &&
      estado.orden.campo === inicial.orden.campo &&
      estado.orden.direccion === inicial.orden.direccion);
  fijar(CLAVES.orden, ordenIgual || !estado.orden ? null : estado.orden.campo);
  fijar(CLAVES.direccion, ordenIgual || !estado.orden || estado.orden.direccion === 'asc' ? null : 'desc');
  // `orden: null` con un orden por defecto no se puede escribir: al leer vuelve el
  // de por defecto, que es lo esperado (siguienteOrden nunca devuelve null).

  fijar(CLAVES.tamano, estado.tamano === inicial.tamano ? null : String(estado.tamano));
  fijar(CLAVES.pagina, estado.pagina <= 1 ? null : String(estado.pagina));
  return salida;
}

export function contarFiltrosActivos(estado: EstadoListado): number {
  return Object.values(estado.filtros).filter((v) => v !== '').length;
}

/** Offset inclusivo para `.range(desde, hasta)` de Supabase. */
export function rangoServidor(estado: Pick<EstadoListado, 'pagina' | 'tamano'>): { desde: number; hasta: number } {
  const desde = (Math.max(1, estado.pagina) - 1) * estado.tamano;
  return { desde, hasta: desde + estado.tamano - 1 };
}

/** Clic en una cabecera: ascendente → descendente → ascendente. Otra columna empieza ascendente. */
export function siguienteOrden(actual: OrdenListado | null, campo: string): OrdenListado {
  if (actual?.campo === campo) return { campo, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' };
  return { campo, direccion: 'asc' };
}

/** Valores de un filtro multivalor (`'activo,inactivo'` → `['activo', 'inactivo']`). */
export function valoresFiltro(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
