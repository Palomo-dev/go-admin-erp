'use client';

/**
 * Hooks de «Tienda» del sitio web:
 * - `useTiendaSitio`: `GET /api/sitio-web/tienda` (KPIs, sedes, plantillas de
 *   detalle, reseñas pendientes y auto-aprobación) y su única escritura.
 * - `useCatalogoSede`: el catálogo web de UNA sede con `/api/website/carta-sede`,
 *   el MISMO motor de la carta por sede (website_branch_products). No hay una
 *   segunda consulta ni una segunda regla de «agotado».
 */
import { useCallback, useEffect, useState } from 'react';
import type { AccionResena, AjustesResenasTienda, RespuestaResenas, RespuestaTienda } from '@/lib/website/tiendaSitio.server';
import type { CambiosAjustesResenas } from '@/lib/website/ajustesResenas';
import type { EstadoResena } from '@/lib/services/website/resenasProducto';
import type { CambioProducto, FiltroCartaSede, RespuestaListadoCartaSede } from '@/lib/services/website/cartaSede';
import { ErrorApiVentas, pedirJson, type FalloVentas } from './useVentasSitio';
import type { TipoPaginaDetalle } from '../paginas/paginasDetalle';

export const RUTA_API_TIENDA = '/api/sitio-web/tienda';
export const RUTA_API_TIENDA_DETALLE = '/api/sitio-web/tienda/detalle';
export const RUTA_API_CARTA_SEDE = '/api/website/carta-sede';

export function useTiendaSitio() {
  const [datos, setDatos] = useState<RespuestaTienda | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloVentas | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      setDatos(await pedirJson<RespuestaTienda>(RUTA_API_TIENDA));
    } catch (error) {
      setDatos(null);
      setFallo(error instanceof ErrorApiVentas ? error.fallo : 'error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const alternarAutoAprobar = useCallback(async (activo: boolean) => {
    setDatos(await pedirJson<RespuestaTienda>(RUTA_API_TIENDA, { method: 'PUT', cuerpo: { autoAprobarResenas: activo } }));
  }, []);

  /** Relee sin el esqueleto (p. ej. el contador de reseñas tras moderar). Si falla, se queda lo que había. */
  const refrescar = useCallback(async () => {
    try {
      setDatos(await pedirJson<RespuestaTienda>(RUTA_API_TIENDA));
    } catch {
      /* el dato anterior sigue siendo válido */
    }
  }, []);

  /**
   * «Crear ficha editable» / «Crear página editable»: agrega la página de detalle al borrador y
   * devuelve su id para abrir el editor. Lanza `ErrorApiVentas` (p. ej. `conflicto_version`).
   */
  const crearDetalle = useCallback(
    async (tipo: TipoPaginaDetalle): Promise<string> => {
      const r = await pedirJson<{ paginaId?: string }>(RUTA_API_TIENDA_DETALLE, {
        method: 'POST',
        cuerpo: { tipo, version: datos?.detalles.version ?? null },
      });
      if (!r.paginaId) throw new ErrorApiVentas('error', 'Respuesta sin página');
      return r.paginaId;
    },
    [datos?.detalles.version],
  );

  return { datos, cargando, fallo, recargar, refrescar, alternarAutoAprobar, crearDetalle };
}

export interface ConsultaCatalogo {
  branchId: number | null;
  q: string;
  filtro: FiltroCartaSede;
  pagina: number;
}

export function urlCatalogo(c: ConsultaCatalogo): string {
  const p = new URLSearchParams({ branch_id: String(c.branchId), filtro: c.filtro, pagina: String(c.pagina) });
  if (c.q.trim()) p.set('q', c.q.trim());
  return `${RUTA_API_CARTA_SEDE}?${p.toString()}`;
}

export function useCatalogoSede(consulta: ConsultaCatalogo) {
  const [datos, setDatos] = useState<RespuestaListadoCartaSede | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloVentas | null>(null);
  const { branchId, q, filtro, pagina } = consulta;

  const recargar = useCallback(async () => {
    if (branchId === null) return;
    setCargando(true);
    setFallo(null);
    try {
      setDatos(await pedirJson<RespuestaListadoCartaSede>(urlCatalogo({ branchId, q, filtro, pagina })));
    } catch (error) {
      setFallo(error instanceof ErrorApiVentas ? error.fallo : 'error');
    } finally {
      setCargando(false);
    }
  }, [branchId, q, filtro, pagina]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Cambia un producto (mostrar/ocultar, agotar) con actualización optimista; revierte si falla. */
  const cambiar = useCallback(
    async (cambio: CambioProducto) => {
      if (branchId === null || !datos) return;
      const previo = datos;
      setDatos({
        ...datos,
        productos: datos.productos.map((p) =>
          p.id === cambio.product_id
            ? {
                ...p,
                ajuste: {
                  is_listed: cambio.is_listed ?? p.ajuste?.is_listed ?? true,
                  web_price: p.ajuste?.web_price ?? null,
                  is_sold_out: cambio.is_sold_out ?? p.ajuste?.is_sold_out ?? false,
                  sold_out_until: cambio.is_sold_out === false ? null : p.ajuste?.sold_out_until ?? null,
                  agotado_hasta: cambio.is_sold_out === false ? null : p.ajuste?.agotado_hasta ?? null,
                  agotado_ahora: cambio.is_sold_out ?? p.ajuste?.agotado_ahora ?? false,
                },
              }
            : p,
        ),
      });
      try {
        await pedirJson(RUTA_API_CARTA_SEDE, { method: 'PUT', cuerpo: { tipo: 'productos', branch_id: branchId, cambios: [cambio] } });
      } catch (error) {
        setDatos(previo);
        throw error;
      }
    },
    [branchId, datos],
  );

  return { datos, cargando, fallo, recargar, cambiar };
}

// ─── Reseñas (Tienda › Reseñas) ──────────────────────────────────────────────

export const RUTA_API_RESENAS = '/api/sitio-web/tienda/resenas';
export type FiltroResenas = EstadoResena | 'all';

/**
 * Reseñas para moderar con `/api/sitio-web/tienda/resenas` (permiso
 * `website.sites.edit` en el servidor). Tras aprobar, rechazar o responder se
 * vuelve a leer la página y se avisa a la pantalla (`alCambiar`) para que el
 * contador de pendientes de la pestaña quede al día.
 */
export function useResenasTienda(filtro: FiltroResenas, pagina: number, alCambiar?: () => void) {
  const [datos, setDatos] = useState<RespuestaResenas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloVentas | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      const p = new URLSearchParams({ estado: filtro, pagina: String(pagina) });
      setDatos(await pedirJson<RespuestaResenas>(`${RUTA_API_RESENAS}?${p.toString()}`));
    } catch (error) {
      setFallo(error instanceof ErrorApiVentas ? error.fallo : 'error');
    } finally {
      setCargando(false);
    }
  }, [filtro, pagina]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const moderar = useCallback(
    async (id: string, accion: AccionResena, respuesta?: string, foto?: string) => {
      await pedirJson(RUTA_API_RESENAS, {
        method: 'PATCH',
        cuerpo: { id, accion, ...(respuesta !== undefined ? { respuesta } : {}), ...(foto !== undefined ? { foto } : {}) },
      });
      await recargar();
      alCambiar?.();
    },
    [recargar, alCambiar],
  );

  return { datos, cargando, fallo, recargar, moderar };
}

// ─── Ajustes de reseñas (Figma 3C) ───────────────────────────────────────────

export const RUTA_API_AJUSTES_RESENAS = '/api/sitio-web/tienda/ajustes-resenas';

/**
 * «Ajustes de reseñas» con `/api/sitio-web/tienda/ajustes-resenas` (permiso `website.sites.edit`).
 * Se lee al abrir la hoja (`activo`); `guardar` devuelve los ajustes ya guardados.
 */
export function useAjustesResenas(activo: boolean) {
  const [datos, setDatos] = useState<AjustesResenasTienda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<FalloVentas | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      setDatos(await pedirJson<AjustesResenasTienda>(RUTA_API_AJUSTES_RESENAS));
    } catch (error) {
      setFallo(error instanceof ErrorApiVentas ? error.fallo : 'error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  const guardar = useCallback(async (cambios: CambiosAjustesResenas) => {
    const r = await pedirJson<AjustesResenasTienda>(RUTA_API_AJUSTES_RESENAS, { method: 'PUT', cuerpo: cambios });
    setDatos(r);
    return r;
  }, []);

  return { datos, cargando, fallo, recargar, guardar };
}
