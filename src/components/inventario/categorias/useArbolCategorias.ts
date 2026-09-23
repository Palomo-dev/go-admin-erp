'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useListadoServidor, type ChipFiltro, type OrdenListado } from '@/components/kit';
import {
  aplanarArbol,
  construirArbol,
  descendientesDe,
  filtrarArbol,
  idsConHijos,
  normalizarBusqueda,
  paginarRaices,
  type FilaArbol,
} from '@/components/kit/arbol';
import categoryService, {
  ErrorCategoria,
  type CategoriaListado,
  type ListadoCategorias,
} from '@/lib/services/categoryService';
import { etiquetaEstacion } from './iconoCategoria';

/**
 * Estado del árbol de categorías (Figma `586:290667`, «Escritorio /
 * Categorías — listo»).
 *
 * - Búsqueda, filtros, orden, página y tamaño viven en la URL
 *   (`useListadoServidor`); la paginación es **por categorías principales**.
 * - El filtrado se hace sobre el árbol completo: una coincidencia arrastra a
 *   sus ancestros (como contexto) y abre su rama.
 * - Los conteos llegan de `categorias_listado` (BD), no del navegador.
 */
export interface NodoCategoria extends CategoriaListado {
  parentId: number | null;
}

export type EstadoCarga = 'cargando' | 'listo' | 'error' | 'sinPermiso';

export const FILTROS_CATEGORIAS = ['estado', 'estacion', 'productos', 'preparacion'] as const;

const ETIQUETAS_FILTRO: Record<string, (v: string) => string> = {
  estado: (v) => `Estado: ${v === 'activas' ? 'Activas' : 'Inactivas'}`,
  estacion: (v) => `Estación: ${v === 'con' ? 'Con estación' : v === 'sin' ? 'Sin estación' : etiquetaEstacion(v)}`,
  productos: (v) => (v === 'sin' ? 'Sin productos' : 'Con productos'),
  preparacion: (v) => (v === 'si' ? 'Requiere preparación' : 'Sin preparación'),
};

function ordenarCon(orden: OrdenListado | null) {
  return (a: NodoCategoria, b: NodoCategoria): number => {
    if (orden?.campo === 'nombre') {
      const r = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      return orden.direccion === 'asc' ? r : -r;
    }
    if (orden?.campo === 'productos') {
      const r = a.productos - b.productos || a.name.localeCompare(b.name, 'es');
      return orden.direccion === 'asc' ? r : -r;
    }
    // Orden del POS: display_order, luego rank, luego nombre (igual que la BD).
    return (
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      (a.rank ?? 0) - (b.rank ?? 0) ||
      a.name.localeCompare(b.name, 'es')
    );
  };
}

export function useArbolCategorias() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;

  const listado = useListadoServidor({
    filtros: FILTROS_CATEGORIAS,
    camposOrden: ['nombre', 'productos'],
    tamanoPorDefecto: 10,
  });

  const [datos, setDatos] = useState<ListadoCategorias | null>(null);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [refrescando, setRefrescando] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [cerradosAMano, setCerradosAMano] = useState<Set<number>>(new Set());
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [primeraCarga, setPrimeraCarga] = useState(true);

  const cargar = useCallback(
    async (refrescar = false) => {
      if (!organizationId) return;
      if (refrescar) setRefrescando(true);
      else setEstado('cargando');
      try {
        const r = await categoryService.getListado(organizationId);
        setDatos(r);
        setEstado('listo');
      } catch (e) {
        if (e instanceof ErrorCategoria && e.sinPermiso) setEstado('sinPermiso');
        else if (!refrescar) setEstado('error');
        else toast({ title: 'No se pudo actualizar', description: 'Se muestra la última lista cargada.', variant: 'destructive' });
      } finally {
        setRefrescando(false);
      }
    },
    [organizationId, toast],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nodos: NodoCategoria[] = useMemo(
    () => (datos?.categorias ?? []).map((c) => ({ ...c, parentId: c.parent_id })),
    [datos],
  );

  // Como antes, el árbol arranca con todas las ramas abiertas.
  useEffect(() => {
    if (primeraCarga && nodos.length) {
      setAbiertos(idsConHijos(nodos));
      setPrimeraCarga(false);
    }
  }, [nodos, primeraCarga]);

  const { busqueda, filtros, orden, pagina, tamano } = listado;

  const coincide = useMemo(() => {
    const termino = normalizarBusqueda(busqueda);
    const f = filtros;
    const hayCriterio = !!termino || Object.keys(f).length > 0;
    if (!hayCriterio) return null;
    return (c: NodoCategoria) => {
      if (termino && !normalizarBusqueda(`${c.name} ${c.slug}`).includes(termino)) return false;
      if (f.estado === 'activas' && !c.is_active) return false;
      if (f.estado === 'inactivas' && c.is_active) return false;
      if (f.estacion === 'con' && !c.station) return false;
      if (f.estacion === 'sin' && c.station) return false;
      if (f.estacion && !['con', 'sin'].includes(f.estacion) && c.station !== f.estacion) return false;
      if (f.productos === 'con' && c.productos + c.productos_regla === 0) return false;
      if (f.productos === 'sin' && c.productos + c.productos_regla > 0) return false;
      if (f.preparacion === 'si' && !c.requires_preparation) return false;
      if (f.preparacion === 'no' && c.requires_preparation) return false;
      return true;
    };
  }, [busqueda, filtros]);

  const arbol = useMemo(() => construirArbol(nodos, ordenarCon(orden)), [nodos, orden]);
  const filtrado = useMemo(() => filtrarArbol(arbol, coincide), [arbol, coincide]);
  const totalRaices = filtrado.raices.length;
  const raicesPagina = useMemo(() => paginarRaices(filtrado.raices, pagina, tamano), [filtrado, pagina, tamano]);

  const filas: FilaArbol<NodoCategoria>[] = useMemo(
    () =>
      aplanarArbol(raicesPagina, {
        abiertos,
        abiertasPorBusqueda: coincide ? filtrado.abiertasPorBusqueda : undefined,
        cerradosAMano,
        coincidencias: coincide ? filtrado.coincidencias : undefined,
      }),
    [raicesPagina, abiertos, cerradosAMano, coincide, filtrado],
  );

  // Una página que ya no existe tras filtrar vuelve a la última válida.
  const { setPagina } = listado;
  useEffect(() => {
    const paginas = Math.max(1, Math.ceil(totalRaices / tamano));
    if (estado === 'listo' && pagina > paginas) setPagina(paginas);
  }, [estado, totalRaices, tamano, pagina, setPagina]);

  // La selección no sobrevive a categorías que ya no existen.
  useEffect(() => {
    setSeleccion((s) => {
      if (!s.size) return s;
      const vivos = new Set(nodos.map((n) => String(n.id)));
      const siguiente = new Set([...s].filter((id) => vivos.has(id)));
      return siguiente.size === s.size ? s : siguiente;
    });
  }, [nodos]);

  const alternar = useCallback(
    (id: number, abiertoAhora: boolean) => {
      if (abiertoAhora) {
        setAbiertos((a) => {
          const s = new Set(a);
          s.delete(id);
          return s;
        });
        setCerradosAMano((c) => new Set(c).add(id));
      } else {
        setAbiertos((a) => new Set(a).add(id));
        setCerradosAMano((c) => {
          const s = new Set(c);
          s.delete(id);
          return s;
        });
      }
    },
    [],
  );

  const expandirTodo = useCallback(() => {
    setAbiertos(idsConHijos(nodos));
    setCerradosAMano(new Set());
  }, [nodos]);

  const contraerTodo = useCallback(() => {
    setAbiertos(new Set());
    setCerradosAMano(idsConHijos(nodos));
  }, [nodos]);

  const resumen = useMemo(() => {
    const activas = nodos.filter((n) => n.is_active).length;
    const niveles = nodos.length ? Math.max(...arbolProfundidades(arbol)) : 0;
    return {
      total: nodos.length,
      activas,
      inactivas: nodos.length - activas,
      raices: arbol.length,
      niveles,
      sinProductos: nodos.filter((n) => n.productos + n.productos_regla === 0).length,
      conEstacion: nodos.filter((n) => !!n.station).length,
      productosTotal: datos?.resumen.productos_total ?? 0,
      productosSinCategoria: datos?.resumen.productos_sin_categoria ?? 0,
    };
  }, [nodos, arbol, datos]);

  const chips: ChipFiltro[] = useMemo(
    () =>
      Object.entries(filtros)
        .filter(([clave]) => ETIQUETAS_FILTRO[clave])
        .map(([clave, valor]) => ({ clave, etiqueta: ETIQUETAS_FILTRO[clave](valor) })),
    [filtros],
  );

  const porId = useMemo(() => new Map(nodos.map((n) => [n.id, n] as const)), [nodos]);
  const descendientes = useCallback((ids: number[]) => descendientesDe(nodos, ids), [nodos]);

  const seleccionadas = useMemo(
    () => [...seleccion].map((id) => porId.get(Number(id))).filter((n): n is NodoCategoria => !!n),
    [seleccion, porId],
  );

  /** Ids de las categorías que cumplen los criterios actuales (para «Seleccionar las N»). */
  const idsCoincidentes = useMemo(
    () => (coincide ? [...filtrado.coincidencias] : nodos.map((n) => n.id)).map(String),
    [coincide, filtrado, nodos],
  );

  return {
    organizationId,
    listado,
    estado,
    refrescando,
    cargar,
    nodos,
    porId,
    filas,
    totalRaices,
    hayCriterios: !!coincide,
    chips,
    resumen,
    alternar,
    expandirTodo,
    contraerTodo,
    seleccion,
    setSeleccion,
    seleccionadas,
    idsCoincidentes,
    descendientes,
  };
}

function arbolProfundidades<T extends { hijos: T[]; nivel: number }>(raices: readonly T[]): number[] {
  const salida: number[] = [0];
  const recorrer = (lista: readonly T[]) => {
    for (const n of lista) {
      salida.push(n.nivel + 1);
      recorrer(n.hijos);
    }
  };
  recorrer(raices);
  return salida;
}

export type ArbolCategorias = ReturnType<typeof useArbolCategorias>;
