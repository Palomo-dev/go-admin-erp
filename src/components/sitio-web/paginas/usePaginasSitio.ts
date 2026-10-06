'use client';

/**
 * Hook ÚNICO de la lista de Páginas (Figma A/04a-04h): lee `GET /api/sitio-web/paginas` y aplica
 * las acciones (en el menú, ocultar, dirección, duplicar, eliminar, crear, restaurar base) sobre
 * el borrador con la versión que devolvió el servidor. El interruptor «En el menú» es optimista:
 * se ve al instante y se revierte si el servidor responde error o conflicto (409).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPaginas, ErrorApiPaginas, type ContextoEscritura } from './apiPaginas';
import { contarPaginas } from './vistaPaginas';
import type { RespuestaEscrituraPaginas, RespuestaPaginas } from './tiposPaginas';

export type FalloPaginas = 'error' | 'sin_permiso';

export interface PaginasSitio {
  datos: RespuestaPaginas | null;
  cargando: boolean;
  fallo: FalloPaginas | null;
  /** Otra persona guardó el borrador antes (409): hay que recargar. */
  conflicto: boolean;
  /** Id de la página con una escritura en curso (o `'*'` para acciones del sitio). */
  ocupado: string | null;
  recargar: () => Promise<void>;
  /** Escribe en el borrador y recarga la lista. Lanza `ErrorApiPaginas` si falla (salvo 409). */
  escribir: (
    clave: string,
    operar: (c: ContextoEscritura) => Promise<RespuestaEscrituraPaginas>,
  ) => Promise<RespuestaEscrituraPaginas | null>;
  alternarEnMenu: (paginaId: string, enMenu: boolean) => Promise<boolean>;
  cerrarConflicto: () => void;
}

export function usePaginasSitio(branchId: number | null): PaginasSitio {
  const [datos, setDatos] = useState<RespuestaPaginas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloPaginas | null>(null);
  const [conflicto, setConflicto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const ref = useRef<RespuestaPaginas | null>(null);
  ref.current = datos;

  const leer = useCallback(
    async (silencioso: boolean) => {
      if (!silencioso) setCargando(true);
      setFallo(null);
      try {
        const r = await apiPaginas.listar(branchId);
        ref.current = r;
        setDatos(r);
      } catch (error) {
        if (!silencioso) setDatos(null);
        setFallo(error instanceof ErrorApiPaginas && error.esSinPermiso ? 'sin_permiso' : 'error');
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    void leer(false);
  }, [leer]);

  const contexto = useCallback((): ContextoEscritura => ({ branchId, version: ref.current?.sitio?.version ?? null }), [branchId]);

  const escribir = useCallback<PaginasSitio['escribir']>(
    async (clave, operar) => {
      setOcupado(clave);
      try {
        const r = await operar(contexto());
        await leer(true);
        return r;
      } catch (error) {
        if (error instanceof ErrorApiPaginas && error.esConflicto) {
          setConflicto(true);
          return null;
        }
        throw error;
      } finally {
        setOcupado(null);
      }
    },
    [contexto, leer],
  );

  const alternarEnMenu = useCallback(
    async (paginaId: string, enMenu: boolean) => {
      const antes = ref.current;
      if (!antes) return false;
      const paginas = antes.paginas.map((p) => (p.id === paginaId ? { ...p, enMenu } : p));
      setDatos({ ...antes, paginas, contadores: contarPaginas(paginas) });
      try {
        const r = await escribir(paginaId, (c) => apiPaginas.modificar(c, paginaId, { accion: 'en_menu', enMenu }));
        if (!r) setDatos(antes);
        return !!r;
      } catch {
        setDatos(antes);
        return false;
      }
    },
    [escribir],
  );

  const recargar = useCallback(async () => {
    setConflicto(false);
    await leer(false);
  }, [leer]);

  return {
    datos,
    cargando,
    fallo,
    conflicto,
    ocupado,
    recargar,
    escribir,
    alternarEnMenu,
    cerrarConflicto: () => setConflicto(false),
  };
}
