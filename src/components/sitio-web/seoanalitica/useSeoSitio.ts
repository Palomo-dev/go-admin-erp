'use client';

/**
 * Estado de «SEO y redes» (Figma B/08). Sin consultas propias del sitio:
 * - `useContextoDiseno` (el mismo de Diseño y Plantillas): permisos del
 *   servidor, dirección real y el borrador V2 con `useSitioV2` (el hook único:
 *   guardar con compare-and-swap, conflicto 409, publicar).
 * - `GET/PUT /api/sitio-web/seo`: lo que el documento no modela (Search
 *   Console, «Ocultar de los buscadores») y el conteo de productos.
 *
 * Título, descripción, imagen y redes se guardan en el BORRADOR; se publican
 * con la barra del módulo (Resumen, Diseño o el editor), no aquí.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useContextoDiseno, type ContextoDiseno } from '../diseno/useContextoDiseno';
import type { EstadoVistaSitio } from '../MarcoSitioWeb';
import type { DatosSeoServidor } from './seo.server';
import {
  REDES_SEO,
  aplicarAlDocumento,
  calidadPaginas,
  contarCambios,
  extraerCodigoVerificacion,
  normalizarRed,
  seoVacio,
  valoresDesdeDocumento,
  type CalidadPagina,
  type RedSeo,
  type ValoresSeo,
} from './seoLogica';

export type FormularioSeo = ValoresSeo & { verificacion: string; ocultar: boolean };

export const RUTA_API_SEO = '/api/sitio-web/seo';

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return { ...(org > 0 ? { 'x-organization-id': String(org) } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

export interface SeoSitio {
  ctx: ContextoDiseno;
  estado: EstadoVistaSitio;
  servidor: DatosSeoServidor | null;
  base: FormularioSeo;
  formulario: FormularioSeo;
  cambiar: (parche: Partial<FormularioSeo>) => void;
  cambiarRed: (red: RedSeo, valor: string) => void;
  descartar: () => void;
  cambios: number;
  errores: { redes: Partial<Record<RedSeo, true>>; verificacion: boolean };
  hayErrores: boolean;
  guardando: boolean;
  guardar: () => Promise<'ok' | 'invalido' | 'error'>;
  errorGuardado: string | null;
  paginas: CalidadPagina[];
  /** Primera vez (B/08-02): sin título, descripción ni imagen y sin empezar. */
  primeraVez: boolean;
  empezar: (parche?: Partial<FormularioSeo>) => void;
  recargar: () => Promise<void>;
}

const VACIO: FormularioSeo = { titulo: '', descripcion: '', imagen: null, redes: { instagram: '', facebook: '', tiktok: '', whatsapp: '' }, verificacion: '', ocultar: false };

export function useSeoSitio(): SeoSitio {
  const ctx = useContextoDiseno();
  const editar = ctx.permisos.editar;
  const [servidor, setServidor] = useState<DatosSeoServidor | null>(null);
  const [falloServidor, setFalloServidor] = useState<'error' | 'sin_permiso' | null>(null);
  const [cargandoServidor, setCargandoServidor] = useState(false);
  const [guardandoAjustes, setGuardandoAjustes] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [empezado, setEmpezado] = useState(false);

  const leerServidor = useCallback(async () => {
    setCargandoServidor(true);
    setFalloServidor(null);
    try {
      const r = await fetch(RUTA_API_SEO, { credentials: 'same-origin', headers: cabeceras(), cache: 'no-store' });
      if (r.status === 401 || r.status === 403) {
        setFalloServidor('sin_permiso');
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      setServidor((await r.json()) as DatosSeoServidor);
    } catch {
      setFalloServidor('error');
    } finally {
      setCargandoServidor(false);
    }
  }, []);

  useEffect(() => {
    if (editar) void leerServidor();
  }, [editar, leerServidor]);

  const documento = ctx.sitio.documento;
  const base = useMemo<FormularioSeo>(
    () => ({ ...valoresDesdeDocumento(documento), verificacion: servidor?.verificacionGoogle ?? '', ocultar: servidor?.ocultarBuscadores === true }),
    [documento, servidor],
  );
  const [formulario, setFormulario] = useState<FormularioSeo>(VACIO);
  const sucio = useRef(false);
  // Mientras no haya cambios, el formulario sigue a la base (carga, recarga, guardado).
  useEffect(() => {
    if (!sucio.current) setFormulario(base);
  }, [base]);

  const cambiar = useCallback((parche: Partial<FormularioSeo>) => {
    sucio.current = true;
    setFormulario((f) => ({ ...f, ...parche }));
  }, []);
  const cambiarRed = useCallback((red: RedSeo, valor: string) => {
    sucio.current = true;
    setFormulario((f) => ({ ...f, redes: { ...f.redes, [red]: valor } }));
  }, []);
  const descartar = useCallback(() => {
    sucio.current = false;
    setErrorGuardado(null);
    setFormulario(base);
  }, [base]);

  const errores = useMemo(() => {
    const redes: Partial<Record<RedSeo, true>> = {};
    for (const r of REDES_SEO) if (normalizarRed(r, formulario.redes[r]) === undefined) redes[r] = true;
    return { redes, verificacion: extraerCodigoVerificacion(formulario.verificacion) === undefined };
  }, [formulario]);
  const hayErrores = Object.keys(errores.redes).length > 0 || errores.verificacion;
  const cambios = contarCambios(formulario, base);

  const sitio = ctx.sitio;
  const guardar = useCallback(async (): Promise<'ok' | 'invalido' | 'error'> => {
    if (hayErrores) return 'invalido';
    setErrorGuardado(null);
    const docCambia =
      formulario.titulo.trim() !== base.titulo.trim() ||
      formulario.descripcion.trim() !== base.descripcion.trim() ||
      (formulario.imagen ?? '') !== (base.imagen ?? '') ||
      REDES_SEO.some((r) => formulario.redes[r].trim() !== base.redes[r].trim());
    if (docCambia) {
      const ok = await sitio.guardar((doc) => aplicarAlDocumento(doc, formulario));
      // Un 409 lo marca `useSitioV2` (`conflicto`) y la página abre su diálogo.
      if (!ok) return 'error';
    }
    const ajustes: Record<string, unknown> = {};
    if (formulario.verificacion.trim() !== base.verificacion.trim()) ajustes.verificacionGoogle = formulario.verificacion.trim() || null;
    if (formulario.ocultar !== base.ocultar && servidor?.ocultarBuscadores !== null) ajustes.ocultarBuscadores = formulario.ocultar;
    if (Object.keys(ajustes).length > 0) {
      setGuardandoAjustes(true);
      try {
        const r = await fetch(RUTA_API_SEO, { method: 'PUT', credentials: 'same-origin', headers: cabeceras(true), body: JSON.stringify(ajustes) });
        const cuerpo = (await r.json().catch(() => null)) as (DatosSeoServidor & { error?: string }) | null;
        if (!r.ok) {
          setErrorGuardado(cuerpo?.error ?? null);
          return 'error';
        }
        if (cuerpo) setServidor(cuerpo);
      } catch {
        return 'error';
      } finally {
        setGuardandoAjustes(false);
      }
    }
    sucio.current = false;
    return 'ok';
  }, [hayErrores, formulario, base, sitio, servidor]);

  const paginas = useMemo(() => (documento ? calidadPaginas(documento) : []), [documento]);

  let estado: EstadoVistaSitio = ctx.estado;
  if (estado === 'listo') {
    if (falloServidor === 'sin_permiso') estado = 'sin_permiso';
    else if (falloServidor === 'error') estado = 'error';
    else if (!servidor && (cargandoServidor || editar)) estado = 'cargando';
  }
  // «Primera vez» de ESTA pantalla (B/08-02), no la del sitio: el sitio existe pero sin SEO.
  const primeraVez = estado === 'listo' && !empezado && !sucio.current && seoVacio(base);

  const empezar = useCallback(
    (parche?: Partial<FormularioSeo>) => {
      setEmpezado(true);
      if (parche) cambiar(parche);
    },
    [cambiar],
  );

  const recargar = useCallback(async () => {
    await Promise.all([leerServidor(), sitio.recargar()]);
    ctx.reintentar();
  }, [leerServidor, sitio, ctx]);

  return {
    ctx,
    estado,
    servidor,
    base,
    formulario,
    cambiar,
    cambiarRed,
    descartar,
    cambios,
    errores,
    hayErrores,
    guardando: sitio.guardando || guardandoAjustes,
    guardar,
    errorGuardado,
    paginas,
    primeraVez,
    empezar,
    recargar,
  };
}
