'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '@/components/pos/types';
import { POSService } from '@/lib/services/posService';
import { isCatalogNotReplicatedError } from '@/lib/offline/posOfflineReads';
import { programarBusqueda, type PosGridProduct } from '@/lib/pos/venta/catalogo';
import { crearControlPedidos, fusionarPaginas, hayMasPaginas } from '@/lib/pos/venta/catalogoGrilla';

/**
 * Carga del catálogo de la grilla del POS con scroll infinito (paso 4 de
 * POS-PLAN; R6).
 *
 * - Al montar pide la página 1 una sola vez (antes salían hasta tres pedidos
 *   iguales al entrar: el de montaje, el de la búsqueda y el del tamaño de
 *   página), también con `reactStrictMode`: un solo efecto es dueño de la
 *   carga y su limpieza cancela lo programado y lo que esté en vuelo.
 * - Cambiar la búsqueda, la categoría o la sucursal vuelve a la página 1 a los
 *   300 ms (`programarBusqueda`, L14); lo cargado se queda a la vista
 *   (atenuado) hasta que llega la respuesta nueva.
 * - Cambiar el tamaño de página (la vista) vuelve a la página 1 en el acto.
 * - `cargarMas` pide la siguiente página si no hay otro pedido en vuelo; toda
 *   respuesta de una búsqueda anterior se descarta (`crearControlPedidos`).
 */
export interface ErrorCatalogo {
  /** Desktop sin red y sin catálogo replicado (L22): aviso propio, no el genérico. */
  sinCatalogo: boolean;
  error: unknown;
}

export interface EstadoCatalogoGrilla {
  productos: PosGridProduct[];
  total: number;
  pagina: number;
  totalPaginas: number;
  /** Primera carga (sin productos que mostrar todavía). */
  cargando: boolean;
  /** Hay productos a la vista y se está pidiendo la página 1 de otra búsqueda. */
  recargando: boolean;
  cargandoMas: boolean;
  /** Falló la página 1: la grilla muestra el estado de error. */
  error: ErrorCatalogo | null;
  /** Falló una página siguiente: lo cargado se queda y se ofrece reintentar. */
  errorMas: boolean;
}

const INICIAL: EstadoCatalogoGrilla = {
  productos: [],
  total: 0,
  pagina: 0,
  totalPaginas: 0,
  cargando: true,
  recargando: false,
  cargandoMas: false,
  error: null,
  errorMas: false,
};

export interface OpcionesCatalogoGrilla {
  busqueda: string;
  categoria: number | null;
  branchFilter: number | null | undefined;
  limite: number;
  /** Aviso (toast) cuando falla una carga. */
  onError?: (e: ErrorCatalogo) => void;
}

export function useCatalogoGrilla({ busqueda, categoria, branchFilter, limite, onError }: OpcionesCatalogoGrilla) {
  const [estado, setEstado] = useState<EstadoCatalogoGrilla>(INICIAL);
  const control = useRef(crearControlPedidos()).current;
  const params = useRef({ busqueda, categoria, branchFilter, limite });
  params.current = { busqueda, categoria, branchFilter, limite };
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const pedir = useCallback(
    (page: number) =>
      POSService.getProductsPaginated({
        page,
        limit: params.current.limite,
        search: params.current.busqueda,
        category_id: params.current.categoria,
        status: 'active',
        branchFilter: params.current.branchFilter,
      }),
    [],
  );

  const cargarPrimera = useCallback(async () => {
    const generacion = control.reiniciar();
    control.turnoPrimera();
    setEstado((e) => ({ ...e, error: null, errorMas: false, cargandoMas: false, cargando: e.productos.length === 0, recargando: e.productos.length > 0 }));
    try {
      const r = await pedir(1);
      if (!control.terminar(generacion)) return;
      setEstado({
        ...INICIAL,
        cargando: false,
        productos: r.data as PosGridProduct[],
        total: r.total,
        pagina: r.page,
        totalPaginas: r.totalPages,
      });
    } catch (error) {
      if (!control.terminar(generacion)) return;
      console.error('Error loading products:', error);
      const e = { sinCatalogo: isCatalogNotReplicatedError(error), error };
      setEstado((prev) => ({ ...prev, cargando: false, recargando: false, error: e }));
      onErrorRef.current?.(e);
    }
  }, [control, pedir]);

  const cargarMas = useCallback(async () => {
    const actual = estadoRef.current;
    if (actual.cargando || actual.recargando || actual.error || !hayMasPaginas(actual.pagina, actual.totalPaginas)) return;
    const generacion = control.turnoSiguiente();
    if (generacion === null) return;
    const siguiente = actual.pagina + 1;
    setEstado((e) => ({ ...e, cargandoMas: true, errorMas: false }));
    try {
      const r = await pedir(siguiente);
      if (!control.terminar(generacion)) return;
      setEstado((e) => ({
        ...e,
        cargandoMas: false,
        productos: fusionarPaginas(e.productos, r.data as PosGridProduct[]),
        total: r.total,
        pagina: r.page,
        totalPaginas: r.totalPages,
      }));
    } catch (error) {
      if (!control.terminar(generacion)) return;
      console.error('Error loading products:', error);
      setEstado((e) => ({ ...e, cargandoMas: false, errorMas: true }));
      onErrorRef.current?.({ sinCatalogo: isCatalogNotReplicatedError(error), error });
    }
  }, [control, pedir]);

  // La página 1: al montar y cada vez que cambian la búsqueda, la categoría,
  // la sucursal o la vista. Un solo efecto, dueño de su carga: la limpieza
  // cancela lo programado y descarta lo que esté en vuelo. Con
  // `reactStrictMode` React monta, desmonta y vuelve a montar; antes las
  // marcas de «primera vez» de los efectos de búsqueda y de vista no se
  // reiniciaban al volver a montar y salían tres pedidos al entrar.
  const filtrosPrevios = useRef<{ busqueda: string; categoria: number | null; branchFilter: number | null | undefined } | null>(null);
  useEffect(() => {
    const antes = filtrosPrevios.current;
    filtrosPrevios.current = { busqueda, categoria, branchFilter };
    const filtrosCambiaron =
      antes !== null && (antes.busqueda !== busqueda || antes.categoria !== categoria || antes.branchFilter !== branchFilter);

    let cancelar: () => void;
    if (filtrosCambiaron) {
      // L14: búsqueda, categoría o sucursal ⇒ página 1 a los 300 ms (sale solo la última).
      cancelar = programarBusqueda({
        paginaActual: estadoRef.current.pagina,
        volverAPaginaUno: () => setEstado((e) => ({ ...e, cargandoMas: false, errorMas: false, recargando: e.productos.length > 0 })),
        cargarPaginaUno: () => void cargarPrimera(),
      });
    } else {
      // Al montar (o volver a montar) y al cambiar de vista (otro tamaño de
      // página): la página 1 en el acto. Sale en una microtarea y no en el
      // cuerpo del efecto: el desmontaje simulado de StrictMode llega antes y
      // la cancela, así también en desarrollo sale un solo pedido.
      let vigente = true;
      void Promise.resolve().then(() => {
        if (vigente) void cargarPrimera();
      });
      cancelar = () => {
        vigente = false;
      };
    }
    return () => {
      cancelar();
      // Lo que esté en vuelo es del montaje, la búsqueda o la vista anterior: se descarta.
      control.reiniciar();
    };
  }, [busqueda, categoria, branchFilter, limite, cargarPrimera, control]);

  /** Cambia productos ya cargados (favorito optimista) sin volver a pedir. */
  const actualizarProductos = useCallback((cambio: (productos: PosGridProduct[]) => PosGridProduct[]) => {
    setEstado((e) => ({ ...e, productos: cambio(e.productos) }));
  }, []);

  return {
    ...estado,
    hayMas: hayMasPaginas(estado.pagina, estado.totalPaginas),
    cargarMas,
    reintentar: cargarPrimera,
    actualizarProductos,
  };
}

export type CatalogoGrilla = ReturnType<typeof useCatalogoGrilla>;

/** Fila del catálogo tal como la entrega la grilla al carrito. */
export type ProductoCatalogo = PosGridProduct & Product;
