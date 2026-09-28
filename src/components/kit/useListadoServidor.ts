'use client';

/**
 * Estado de un listado paginado en el servidor, en la URL (ver listadoUrl.ts).
 *
 * ```tsx
 * const listado = useListadoServidor({
 *   filtros: ['estado', 'tipo'],
 *   camposOrden: ['nombre', 'creado'],
 *   ordenPorDefecto: { campo: 'nombre', direccion: 'asc' },
 * });
 * // En el servicio: .range(listado.rango.desde, listado.rango.hasta)
 * ```
 *
 * Buscar, filtrar, ordenar o cambiar el tamaño vuelven a la página 1 y
 * reemplazan la entrada del historial; cambiar de página agrega una, así
 * «atrás» regresa a la página anterior del listado.
 */
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  contarFiltrosActivos,
  escribirEstadoListado,
  estadoInicial,
  leerEstadoListado,
  rangoServidor,
  siguienteOrden,
  type ConfigListado,
  type EstadoListado,
  type OrdenListado,
} from './listadoUrl';

export interface ListadoServidor extends EstadoListado {
  /** Offset inclusivo para `.range(desde, hasta)`. */
  rango: { desde: number; hasta: number };
  filtrosActivos: number;
  /** Hay búsqueda o filtros: un listado vacío es «sin resultados», no «vacío». */
  hayCriterios: boolean;
  setBusqueda: (texto: string) => void;
  /** `null`, `''` o `[]` quitan el filtro. Un arreglo se guarda separado por comas. */
  setFiltro: (clave: string, valor: string | readonly string[] | null) => void;
  limpiarFiltros: () => void;
  /** Filtros y búsqueda. */
  limpiarTodo: () => void;
  /** Clic en una cabecera ordenable. */
  ordenarPor: (campo: string) => void;
  setOrden: (orden: OrdenListado | null) => void;
  setPagina: (pagina: number) => void;
  setTamano: (tamano: number) => void;
  /** Varios cambios de una vez (vuelve a la página 1 salvo que se indique). */
  actualizar: (cambio: Partial<EstadoListado>) => void;
}

export function useListadoServidor(config: ConfigListado): ListadoServidor {
  const router = useRouter();
  // Con src/pages en el repo estos hooks devuelven `| null` (ver memoria tsc).
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const actuales = params?.toString() ?? '';

  // La configuración suele llegar como objeto literal: se estabiliza por contenido.
  const claveConfig = JSON.stringify(config);
  const cfg = useMemo(() => JSON.parse(claveConfig) as ConfigListado, [claveConfig]);

  const estado = useMemo(() => leerEstadoListado(new URLSearchParams(actuales), cfg), [actuales, cfg]);

  const navegar = useCallback(
    (siguiente: EstadoListado, historial: 'push' | 'replace') => {
      const qs = escribirEstadoListado(siguiente, cfg, actuales).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (historial === 'push') router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [actuales, cfg, pathname, router],
  );

  const actualizar = useCallback(
    (cambio: Partial<EstadoListado>) => navegar({ ...estado, pagina: 1, ...cambio }, 'replace'),
    [estado, navegar],
  );

  const setFiltro = useCallback(
    (clave: string, valor: string | readonly string[] | null) => {
      const texto = Array.isArray(valor) ? valor.join(',') : ((valor as string | null) ?? '');
      const filtros = { ...estado.filtros };
      if (texto) filtros[clave] = texto;
      else delete filtros[clave];
      actualizar({ filtros });
    },
    [actualizar, estado.filtros],
  );

  return {
    ...estado,
    rango: rangoServidor(estado),
    filtrosActivos: contarFiltrosActivos(estado),
    hayCriterios: estado.busqueda !== '' || contarFiltrosActivos(estado) > 0,
    setBusqueda: (texto) => {
      if (texto.trim() !== estado.busqueda) actualizar({ busqueda: texto.trim() });
    },
    setFiltro,
    limpiarFiltros: () => actualizar({ filtros: {} }),
    limpiarTodo: () => actualizar({ filtros: {}, busqueda: '' }),
    ordenarPor: (campo) => actualizar({ orden: siguienteOrden(estado.orden, campo) }),
    setOrden: (orden) => actualizar({ orden: orden ?? estadoInicial(cfg).orden }),
    setPagina: (pagina) => navegar({ ...estado, pagina: Math.max(1, Math.floor(pagina)) }, 'push'),
    setTamano: (tamano) => actualizar({ tamano }),
    actualizar,
  };
}
