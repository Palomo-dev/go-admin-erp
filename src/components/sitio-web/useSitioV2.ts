'use client';

/**
 * Hook ÚNICO del sitio V2 del módulo «Sitio web»: sitio, borrador, cambios sin
 * publicar, guardar (compare-and-swap por versión), publicar, revisiones y
 * conflicto. Lo usan el Resumen, el asistente de creación, Diseño, Páginas,
 * Configuración › Zona de peligro y la barra del editor: nadie más llama a
 * `clienteSitiosV2` para publicar ni arma su propio estado de publicación.
 *
 * - `asegurar()` crea el sitio principal si aún no existe (`ensure_site_draft`,
 *   idempotente: importa el sitio legacy y no pisa un borrador existente).
 * - `guardar(cambiar)` aplica `cambiar` al ÚLTIMO documento leído y guarda con
 *   la versión de ese documento. Si otra persona guardó antes, la API responde
 *   409: el hook marca `conflicto` y no pisa su trabajo.
 * - `publicar(nota, { activar })` publica la versión actual y revalida el sitio
 *   público. Con `activar`, si el sitio aún no está en la web y el lector público
 *   está listo, la misma llamada lo activa. Sin `activar`, la revisión queda
 *   publicada y la web sigue con el sitio anterior.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import { activarAlPublicarSitio } from '@/lib/website/v2/activarAlPublicar';
import { igualesEstructural } from '@/lib/website/v2/mapeoAjustes';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { BorradorSitio, ResultadoPublicacion, RevisionResumen, SitioResumen } from '@/lib/website/v2/tipos';
import { resolverEstadoPublicacion, type EstadoPublicacion } from './ui/estadoPublicacion';

export interface OpcionesSitioV2 {
  /** Sede del sitio (`null` = sitio principal). */
  branchId?: number | null;
  /** Crea el sitio al montar si no existe (asistente). Por defecto solo lee. */
  crearSiFalta?: boolean;
  /** No carga nada (p. ej. sin permiso o sin organización). */
  deshabilitado?: boolean;
}

export interface SitioV2 {
  sitio: SitioResumen | null;
  borrador: BorradorSitio | null;
  documento: DocumentoSitio | null;
  cargando: boolean;
  guardando: boolean;
  publicando: boolean;
  error: ErrorApiSitio | null;
  /** Error síncrono de la última publicación, también antes del siguiente render. */
  errorDePublicacion?: () => ErrorApiSitio | null;
  /** Otra persona guardó o publicó una versión más nueva (409). */
  conflicto: boolean;
  estadoPublicacion: EstadoPublicacion;
  asegurar: () => Promise<SitioResumen | null>;
  guardar: (cambiar: (documento: DocumentoSitio) => DocumentoSitio) => Promise<boolean>;
  /** `activar`: si el sitio aún no está activo en la web, la misma llamada lo activa. */
  publicar: (nota?: string | null, opciones?: { activar?: boolean }) => Promise<ResultadoPublicacion | null>;
  revisiones: () => Promise<RevisionResumen[]>;
  /**
   * Despublica el sitio principal (`false`) o lo vuelve a mostrar (`true`).
   * Volver a mostrarlo publica antes el borrador V2 con `publicar()`: es la
   * misma vía de publicación que el Resumen, Diseño y el editor.
   */
  cambiarVisibilidad?: (publicado: boolean) => Promise<{ publicado: boolean; publicadoEn: string | null } | null>;
  /** Vuelve a leer sitio y borrador (y limpia el conflicto). */
  recargar: () => Promise<void>;
}

function comoError(error: unknown): ErrorApiSitio {
  return error instanceof ErrorApiSitio ? error : new ErrorApiSitio('error_interno', 500, 'No se pudo completar la operación.');
}

export function useSitioV2({ branchId = null, crearSiFalta = false, deshabilitado = false }: OpcionesSitioV2 = {}): SitioV2 {
  const [sitio, setSitio] = useState<SitioResumen | null>(null);
  const [borrador, setBorrador] = useState<BorradorSitio | null>(null);
  const [cargando, setCargando] = useState(!deshabilitado);
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<ErrorApiSitio | null>(null);
  const [conflicto, setConflicto] = useState(false);
  const [falloPublicacion, setFalloPublicacion] = useState(false);
  const errorPublicacionRef = useRef<ErrorApiSitio | null>(null);
  // La última versión conocida: `guardar` y `publicar` nunca usan una vieja de un cierre.
  const ref = useRef<BorradorSitio | null>(null);
  ref.current = borrador;

  const leer = useCallback(
    async (crear: boolean): Promise<SitioResumen | null> => {
      const sitios = await clienteSitiosV2.listar();
      let encontrado = sitios.find((s) => s.branchId === branchId) ?? null;
      if (!encontrado && crear) encontrado = (await clienteSitiosV2.crear(branchId)).sitio;
      setSitio(encontrado);
      if (encontrado && encontrado.versionBorrador !== null) {
        const b = await clienteSitiosV2.borrador(encontrado.id);
        setBorrador(b);
        setSitio(b.sitio);
        return b.sitio;
      }
      setBorrador(null);
      return encontrado;
    },
    [branchId],
  );

  const cargar = useCallback(
    async (crear: boolean) => {
      setCargando(true);
      setError(null);
      try {
        return await leer(crear);
      } catch (e) {
        setError(comoError(e));
        return null;
      } finally {
        setCargando(false);
      }
    },
    [leer],
  );

  useEffect(() => {
    if (deshabilitado) {
      setCargando(false);
      return;
    }
    void cargar(crearSiFalta);
  }, [cargar, crearSiFalta, deshabilitado]);

  const asegurar = useCallback(async () => {
    if (ref.current) return ref.current.sitio;
    return cargar(true);
  }, [cargar]);

  const guardar = useCallback(async (cambiar: (documento: DocumentoSitio) => DocumentoSitio) => {
    const actual = ref.current;
    if (!actual) return false;
    setGuardando(true);
    try {
      const documento = cambiar(actual.documento);
      if (igualesEstructural(documento, actual.documento)) return true;
      const r = await clienteSitiosV2.guardar(actual.sitio.id, documento, actual.version);
      const siguiente: BorradorSitio = {
        ...actual,
        documento,
        version: r.version,
        actualizadoEn: r.actualizadoEn,
        sitio: { ...actual.sitio, versionBorrador: r.version, borradorActualizadoEn: r.actualizadoEn, cambiosSinPublicar: true },
      };
      ref.current = siguiente;
      setBorrador(siguiente);
      setSitio(siguiente.sitio);
      return true;
    } catch (e) {
      const err = comoError(e);
      if (err.esConflicto) setConflicto(true);
      setError(err);
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  const publicar = useCallback(async (nota: string | null = null, opciones?: { activar?: boolean }) => {
    const actual = ref.current;
    if (!actual) return null;
    setPublicando(true);
    setFalloPublicacion(false);
    errorPublicacionRef.current = null;
    setError(null);
    try {
      const r = await clienteSitiosV2.publicar(actual.sitio.id, actual.version, nota, !!opciones?.activar);
      const vigente = ref.current ?? actual;
      const sitioPublicado: SitioResumen = {
        ...vigente.sitio,
        revisionPublicadaId: r.revisionId,
        cambiosSinPublicar: !igualesEstructural(vigente.documento, actual.documento),
        ...(r.activacion === 'activada' ? { v2Adoptado: true, v2AdoptadoEn: r.publicadaEn } : {}),
      };
      const siguiente = { ...vigente, sitio: sitioPublicado };
      ref.current = siguiente;
      setBorrador(siguiente);
      setSitio(sitioPublicado);
      // La API de publicación espera la confirmación del lector público antes de responder.
      return r;
    } catch (e) {
      const err = comoError(e);
      errorPublicacionRef.current = err;
      if (err.esConflicto) setConflicto(true);
      else setFalloPublicacion(true);
      setError(err);
      return null;
    } finally {
      setPublicando(false);
    }
  }, []);

  const cambiarVisibilidad = useCallback(
    async (publicado: boolean) => {
      const actual = ref.current?.sitio ?? sitio;
      if (!actual) return null;
      if (publicado && ref.current && ref.current.sitio.cambiosSinPublicar !== false) {
        const r = await publicar(null, { activar: activarAlPublicarSitio(!!ref.current.sitio.v2Adoptado) });
        if (!r) return null;
      }
      setPublicando(true);
      try {
        return await clienteSitiosV2.visibilidad(actual.id, publicado);
      } catch (e) {
        setError(comoError(e));
        return null;
      } finally {
        setPublicando(false);
      }
    },
    [sitio, publicar],
  );

  const revisiones = useCallback(async () => {
    const actual = ref.current?.sitio ?? sitio;
    return actual ? clienteSitiosV2.revisiones(actual.id) : [];
  }, [sitio]);

  const recargar = useCallback(async () => {
    setConflicto(false);
    await cargar(false);
  }, [cargar]);

  const estadoPublicacion = useMemo(
    () =>
      resolverEstadoPublicacion({
        guardando,
        falloPublicacion,
        publicadoEn: sitio?.revisionPublicadaId ? sitio.borradorActualizadoEn ?? 'publicado' : null,
        cambiosSinPublicar: sitio?.cambiosSinPublicar ? 1 : 0,
      }),
    [guardando, falloPublicacion, sitio],
  );

  return {
    sitio,
    borrador,
    documento: borrador?.documento ?? null,
    cargando,
    guardando,
    publicando,
    error,
    errorDePublicacion: () => errorPublicacionRef.current,
    conflicto,
    estadoPublicacion,
    asegurar,
    guardar,
    publicar,
    cambiarVisibilidad,
    revisiones,
    recargar,
  };
}
