'use client';

/**
 * Hook ÚNICO de «Configuración del sitio» (Figma B/12): un solo formulario con
 * un solo estado sucio y un solo «Guardar cambios».
 *
 * - Ajustes del sitio (`website_settings`) → `GET/PUT /api/sitio-web/configuracion`
 *   (servidor: `update_website_settings`, permiso `website.sites.edit`).
 * - Nombre, logo y favicon → identidad del borrador V2 con `useSitioV2` (el mismo
 *   dato que Diseño › Logo y favicon). Si el sitio V2 aún no existe, se crea con
 *   `asegurar()` y la identidad se escribe en cuanto llega el borrador.
 * - Legales → la lista de Páginas (`usePaginasSitio`, fuente única: las páginas
 *   del sitio); crear un documento usa la misma escritura que «Nueva página».
 * - Despublicar / volver a publicar y Eliminar → rutas del servidor con
 *   `website.sites.publish`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import {
  cambiaIdentidad,
  conDatosDeOrganizacion,
  contarCambios,
  documentosLegales,
  formularioInicial,
  parcheAjustes,
  validarFormulario,
  type DocumentoLegalVista,
  type ErroresFormulario,
  type FormularioConfiguracion,
  type RespuestaConfiguracion,
} from '@/lib/website/configuracionSitio';
import { useSitioV2 } from '../useSitioV2';
import { usePaginasSitio } from '../paginas/usePaginasSitio';
import { apiPaginas } from '../paginas/apiPaginas';
import { ErrorApiConfiguracion, RUTA_API_CONFIGURACION, falloDe, pedirApi, type FalloApi } from './api';

export type ResultadoGuardado = 'ok' | 'error' | 'pendiente' | 'conflicto' | 'invalido';

export interface ConfiguracionSitio {
  datos: RespuestaConfiguracion | null;
  cargando: boolean;
  fallo: FalloApi | null;
  original: FormularioConfiguracion | null;
  formulario: FormularioConfiguracion | null;
  errores: ErroresFormulario;
  cambios: number;
  guardando: boolean;
  /** El último guardado falló: se pinta el EmptyState de error SIN perder lo sucio (B/12-04). */
  errorGuardado: boolean;
  /** Las páginas legales (null mientras carga). */
  legales: DocumentoLegalVista[] | null;
  legalesError: boolean;
  /** Clave del documento legal que se está creando. */
  creandoLegal: string | null;
  publicando: boolean;
  eliminando: boolean;
  conflicto: boolean;
  editar: <K extends keyof FormularioConfiguracion>(campo: K, valor: FormularioConfiguracion[K]) => void;
  usarDatosOrganizacion: () => void;
  descartar: () => void;
  guardar: () => Promise<ResultadoGuardado>;
  cerrarErrorGuardado: () => void;
  recargar: () => Promise<void>;
  crearLegal: (doc: DocumentoLegalVista) => Promise<string | null>;
  cambiarPublicacion: (publicado: boolean) => Promise<boolean>;
  eliminarSitio: (confirmacion: string) => Promise<FalloApi | null>;
}

function identidadDe(doc: DocumentoSitio | null): { nombre: string | null; logoUrl: string | null; faviconUrl: string | null } {
  return {
    nombre: valorCampo(doc?.identidad?.nombre),
    logoUrl: valorCampo(doc?.identidad?.logoUrl),
    faviconUrl: valorCampo(doc?.identidad?.faviconUrl),
  };
}

/** Aplica la identidad del formulario al documento (campo vacío = `clear`, hereda del sitio anterior). */
export function conIdentidad(doc: DocumentoSitio, f: Pick<FormularioConfiguracion, 'nombre' | 'logoUrl' | 'faviconUrl'>): DocumentoSitio {
  const campo = (v: string | null) => (v && v.trim() ? { mode: 'value' as const, value: v.trim() } : { mode: 'clear' as const });
  return { ...doc, identidad: { ...doc.identidad, nombre: campo(f.nombre), logoUrl: campo(f.logoUrl), faviconUrl: campo(f.faviconUrl) } };
}

export function useConfiguracionSitio(): ConfiguracionSitio {
  const sitio = useSitioV2();
  const paginas = usePaginasSitio(null);
  const [datos, setDatos] = useState<RespuestaConfiguracion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [original, setOriginal] = useState<FormularioConfiguracion | null>(null);
  const [formulario, setFormulario] = useState<FormularioConfiguracion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(false);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [creandoLegal, setCreandoLegal] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  // Identidad que espera a que exista el borrador V2 (sitio recién creado con `asegurar`).
  const identidadPendiente = useRef<{ f: FormularioConfiguracion; resolver: (ok: boolean) => void } | null>(null);

  const documento = sitio.documento;
  const identidad = useMemo(() => identidadDe(documento), [documento]);

  const aplicar = useCallback(
    (r: RespuestaConfiguracion) => {
      const f = formularioInicial(r, identidad);
      setDatos(r);
      setOriginal(f);
      setFormulario(f);
    },
    [identidad],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      const r = await pedirApi<RespuestaConfiguracion>(RUTA_API_CONFIGURACION);
      setDatos(r);
    } catch (error) {
      setDatos(null);
      setFallo(falloDe(error));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El formulario se arma cuando están los ajustes Y el borrador (o se sabe que no hay).
  const listoSitio = !sitio.cargando;
  const armado = useRef(false);
  useEffect(() => {
    if (!datos || !listoSitio || armado.current) return;
    armado.current = true;
    aplicar(datos);
  }, [datos, listoSitio, aplicar]);

  // Escribe la identidad pendiente en cuanto el borrador recién creado llega.
  const guardarV2 = sitio.guardar;
  useEffect(() => {
    const pendiente = identidadPendiente.current;
    if (!pendiente || !sitio.borrador) return;
    identidadPendiente.current = null;
    void guardarV2((doc) => conIdentidad(doc, pendiente.f)).then(pendiente.resolver);
  }, [sitio.borrador, guardarV2]);

  const editar = useCallback(<K extends keyof FormularioConfiguracion>(campo: K, valor: FormularioConfiguracion[K]) => {
    setFormulario((f) => (f ? { ...f, [campo]: valor } : f));
  }, []);

  const usarDatosOrganizacion = useCallback(() => {
    if (!datos) return;
    setFormulario((f) => (f ? conDatosDeOrganizacion(f, datos.organizacion) : f));
  }, [datos]);

  const descartar = useCallback(() => {
    setFormulario(original);
    setErrorGuardado(false);
    setMostrarErrores(false);
  }, [original]);

  const contactoDisponible = !!datos && !datos.pendientes.includes('contacto');
  const errores = useMemo(
    () => (formulario && mostrarErrores ? validarFormulario(formulario, contactoDisponible) : {}),
    [formulario, mostrarErrores, contactoDisponible],
  );
  const cambios = original && formulario ? contarCambios(original, formulario) : 0;

  const escribirIdentidad = useCallback(
    async (f: FormularioConfiguracion): Promise<boolean> => {
      if (sitio.borrador) return guardarV2((doc) => conIdentidad(doc, f));
      // Sin sitio V2: se crea y la identidad se escribe cuando llega el borrador.
      const promesa = new Promise<boolean>((resolver) => {
        identidadPendiente.current = { f, resolver };
      });
      const creado = await sitio.asegurar();
      if (!creado) {
        identidadPendiente.current = null;
        return false;
      }
      return promesa;
    },
    [sitio, guardarV2],
  );

  const guardar = useCallback(async (): Promise<ResultadoGuardado> => {
    if (!original || !formulario || !datos) return 'error';
    setMostrarErrores(true);
    if (Object.keys(validarFormulario(formulario, contactoDisponible)).length > 0) return 'invalido';
    setGuardando(true);
    setErrorGuardado(false);
    try {
      const parche = parcheAjustes(original, formulario);
      let r = datos;
      if (Object.keys(parche).length > 0) r = await pedirApi<RespuestaConfiguracion>(RUTA_API_CONFIGURACION, { method: 'PUT', body: parche });
      if (cambiaIdentidad(original, formulario)) {
        const ok = await escribirIdentidad(formulario);
        if (!ok) {
          setDatos(r);
          setErrorGuardado(true);
          return sitio.conflicto ? 'conflicto' : 'error';
        }
      }
      const siguiente = { ...formularioInicial(r, formulario), nombre: formulario.nombre, logoUrl: formulario.logoUrl, faviconUrl: formulario.faviconUrl };
      setDatos(r);
      setOriginal(siguiente);
      setFormulario(siguiente);
      setMostrarErrores(false);
      return 'ok';
    } catch (error) {
      if (error instanceof ErrorApiConfiguracion && error.fallo === 'pendiente') return 'pendiente';
      setErrorGuardado(true);
      return 'error';
    } finally {
      setGuardando(false);
    }
  }, [original, formulario, datos, contactoDisponible, escribirIdentidad, sitio.conflicto]);

  const recargarSitio = sitio.recargar;
  const recargarPaginas = paginas.recargar;
  const recargar = useCallback(async () => {
    armado.current = false;
    setErrorGuardado(false);
    await Promise.all([cargar(), recargarSitio(), recargarPaginas()]);
  }, [cargar, recargarSitio, recargarPaginas]);

  const legales = useMemo(() => {
    if (!paginas.datos) return null;
    return documentosLegales(
      paginas.datos.paginas.map((p) => ({
        id: p.id,
        slug: p.slug,
        titulo: p.titulo,
        publicada: p.publicada,
        estado: p.estado.tipo,
        actualizadaEn: p.actualizadaEn,
      })),
    );
  }, [paginas.datos]);

  const escribirPagina = paginas.escribir;
  const crearLegal = useCallback(
    async (doc: DocumentoLegalVista): Promise<string | null> => {
      setCreandoLegal(doc.clave);
      try {
        const r = await escribirPagina('*', (c) => apiPaginas.crear(c, { plantilla: 'legal', titulo: doc.titulo, slug: doc.slug, enMenu: false }));
        return r?.paginaId ?? null;
      } catch {
        return null;
      } finally {
        setCreandoLegal(null);
      }
    },
    [escribirPagina],
  );

  // Despublicar y volver a publicar van por el hook único del sitio V2
  // (`useSitioV2().cambiarVisibilidad`): «Volver a publicar» publica antes el
  // borrador con `publicar()`, la misma vía del Resumen, Diseño y el editor.
  const { cambiarVisibilidad } = sitio;
  const cambiarPublicacion = useCallback(
    async (publicado: boolean) => {
      if (!cambiarVisibilidad) return false;
      setPublicando(true);
      try {
        const r = await cambiarVisibilidad(publicado);
        if (!r) return false;
        setDatos((d) => (d ? { ...d, ajustes: { ...d.ajustes, publicado: r.publicado, publicadoEn: r.publicadoEn } } : d));
        return true;
      } finally {
        setPublicando(false);
      }
    },
    [cambiarVisibilidad],
  );

  const eliminarSitio = useCallback(
    async (confirmacion: string): Promise<FalloApi | null> => {
      setEliminando(true);
      try {
        await pedirApi(`${RUTA_API_CONFIGURACION}/eliminar`, { method: 'POST', body: { confirmacion } });
        await recargar();
        return null;
      } catch (error) {
        return falloDe(error);
      } finally {
        setEliminando(false);
      }
    },
    [recargar],
  );

  return {
    datos,
    cargando: cargando || (!!datos && !formulario),
    fallo,
    original,
    formulario,
    errores,
    cambios,
    guardando,
    errorGuardado,
    legales,
    legalesError: paginas.fallo !== null,
    creandoLegal,
    publicando,
    eliminando,
    conflicto: sitio.conflicto,
    editar,
    usarDatosOrganizacion,
    descartar,
    guardar,
    cerrarErrorGuardado: () => setErrorGuardado(false),
    recargar,
    crearLegal,
    cambiarPublicacion,
    eliminarSitio,
  };
}
