'use client';

/**
 * Estado y acciones del editor visual del sitio (Figma A/05a-05n, D/05-13…05-28, figma-estilo).
 *
 * Es la lógica que antes vivía dentro de `organizacion/branding/editor/[pageId]/page.tsx`,
 * movida aquí para que la UI nueva (BarraEditor, ListaSecciones, InspectorSeccion, móvil) no
 * tenga lógica propia. Dos modos:
 *
 * - V2 (borrador → publicar): el documento del borrador lo da `useSitioV2` (el hook ÚNICO del
 *   módulo para borrador, guardado con compare-and-swap, publicar y conflicto). Aquí solo se
 *   mantiene la COPIA EN EDICIÓN (página abierta, ajustes, menús) y se autoguarda al borrador
 *   con una espera corta (A/05m «Guardar ≠ publicar»).
 * - Legacy (los sitios sin borrador V2): se edita sobre `website_pages`,
 *   `website_page_sections` y `website_settings`. En legacy guardar ES publicar: no hay
 *   autoguardado y el primario dice «Guardar y publicar». El guardado va en UN lote a
 *   `POST /api/sitio-web/editor/guardar` (withOrg + `website.sites.edit` y
 *   `website.sites.publish` exigidos en el servidor). La LECTURA y las acciones inmediatas
 *   de secciones (añadir, duplicar, eliminar) todavía usan `websitePageBuilderService` y
 *   `websiteSettingsService` desde el navegador con la organización activa del cliente,
 *   sujetas a RLS: no es el servidor quien la pone en esas llamadas.
 *
 * En las rutas V2 y en el guardado legacy la organización la pone el servidor (`withOrg`);
 * los permisos se leen del resumen del servidor solo para la interfaz y las rutas los
 * vuelven a exigir.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  websitePageBuilderService,
  getSectionDefinition,
  type WebsitePage,
  type WebsitePageSection,
  type WebsitePageWithSections,
} from '@/lib/services/websitePageBuilderService';
import { websiteSettingsService, type WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { websiteMenuGroupService, type MenuGroup } from '@/lib/services/websiteMenuGroupService';
import { branchService } from '@/lib/services/branchService';
import type { Branch } from '@/types/branch';
import { baseLienzoSitio, pedirFirmaLienzo, urlLienzoBorrador, urlPublicaSitio, MARGEN_RENOVAR_FIRMA_MS } from './direccionSitio';
import type { SectionManifest } from '@/lib/services/website/sectionContract';
import { getDefaultSectionsForPageType } from '@/lib/services/website/defaultProductDetailSections';
import { avisoFaltanDatos } from '@/lib/services/website/fuentesDatosSecciones';
import { useConteoFuentes } from '@/lib/website/useConteoFuentes';
import { ajustesParaLienzo } from '@/lib/website/ajustesVivos';
import { temaParaLienzo } from '@/lib/website/v2/tokensEstilo';
import { useHistory } from '@/components/organization/branding/editor/useHistory';
import type { DocumentoSitio, ItemMenu } from '@/lib/website/contrato/documentoSitio';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import type { RevisionResumen, SitioResumen } from '@/lib/website/v2/tipos';
import type { ProgramacionPublicacion, RevisionConDocumento } from '@/lib/website/v2/tiposEditor';
import { columnaVaAlDocumento } from '@/lib/website/v2/mapeoAjustes';
import {
  ajustesDesdeDocumento,
  aplicarAjustesAlDocumento,
  aplicarPaginaAlDocumento,
  contarPersonalizados,
  estadoSecciones,
  fijarModoCampo,
  nuevoIdSeccion,
  paginaAVista,
  paginasDesdeDocumento,
  restablecerSeccion,
  type EstadoSeccion,
} from '@/lib/website/v2/vistaEditor';
import { combinarDocumentos, type Choque, type Eleccion } from '@/lib/website/v2/combinarDocumentos';
import { avisoTrasPublicar, debeActivarAlPublicar } from '@/lib/website/v2/activarAlPublicar';
import { listarCambios, type CambioPublicacion } from '@/lib/website/v2/cambiosPublicacion';
import { reemplazarItemsMenu } from '@/components/sitio-web/paginas/operacionesMenu';
import { armarLoteLegacy } from './loteLegacy';
import {
  alternarVisibleTodo,
  aplicarComparable,
  aplicarVisibilidad,
  comparableDe,
  escribirEstiloSeccion,
  origenGruposEstilo,
  restablecerGrupoEstilo,
  type EstiloSeccion,
  type GrupoEstilo,
  type OrigenGrupo,
  type Visibilidad,
} from '@/lib/website/v2/estiloSeccion';
import { useResumenSitio } from '@/components/sitio-web/resumen/useResumenSitio';
import { useSitioV2 } from '@/components/sitio-web/useSitioV2';
import { rutaEditorSitio } from '@/components/sitio-web/rutasSitioWeb';
import type { DispositivoVista } from '@/components/sitio-web/ui/dispositivos';
import { useTextosEditor } from './textos';
import { cambiosParaFilaLegacy } from './inspector/zonaGlobalLogica';
import { programarAutoguardado, type Autoguardado } from './useAutoguardado';

/**
 * Activar V2 bloquea el guardado legacy del sitio. Hasta que goadmin-websites lea la revisión
 * publicada, activarlo dejaría la web congelada: se habilita con NEXT_PUBLIC_WEBSITE_V2_LECTOR=1.
 */
export const LECTOR_PUBLICO_V2_LISTO = process.env.NEXT_PUBLIC_WEBSITE_V2_LECTOR === '1';

/** Espera tras el último cambio antes de guardar el borrador (A/05m). */
export const ESPERA_AUTOGUARDADO_MS = 1500;

const UUID_MENU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rutas reales de las plantillas de detalle y de flujo (F9.4). */
const RUTA_DETALLE: Record<string, string> = {
  product_detail: 'productos',
  category_detail: 'categorias',
  cart: 'carrito',
  checkout: 'checkout',
  order_confirmation: 'pedido',
  space_detail: 'espacios',
  account: 'mi-cuenta',
};

export type EstadoCargaEditor = 'cargando' | 'listo' | 'no_encontrada' | 'error' | 'sin_permiso';
/** Lo que pinta la píldora de la barra. */
export type EstadoGuardado = 'guardado' | 'cambios' | 'guardando' | 'error';
export type ZonaGlobal = 'header' | 'footer';
export type AmbitoSede = 'heredada' | 'personalizada' | 'solo-esta-sede';
/** Operación retenida sobre una sección compartida hasta responder «¿Solo en <Sede> o en todas?». */
type OperacionSede = { tipo: 'cambio'; cambio: (s: WebsitePageSection) => WebsitePageSection } | { tipo: 'eliminar' };

/** Sede elegible en el selector «Editar el sitio de» (D/05-13). */
export interface SedeSelector {
  branchId: number;
  nombre: string;
  /** Publicada en la web (`is_web_published` con tipo). */
  enLaWeb: boolean;
  /** Ya tiene sitio V2 propio. */
  tieneSitio: boolean;
}

export interface ConflictoEditor {
  /** Quién publicó o guardó y cuándo (de la última revisión), si se sabe. */
  autor: string | null;
  cuando: string | null;
  publicado: boolean;
  /** Hay revisión base: se puede combinar. */
  puedeCombinar: boolean;
}

function mensaje(error: unknown, respaldo: string): string {
  if (error instanceof ErrorApiSitio) return error.message || respaldo;
  if (error instanceof Error) return error.message || respaldo;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return respaldo;
}

function revalidarSitioPublico(): void {
  if (typeof fetch === 'undefined') return;
  fetch('/api/website/revalidate', { method: 'POST', keepalive: true }).catch(() => undefined);
}

export function useEditorSitio() {
  const t = useTextosEditor();
  const params = useParams();
  const pageIdInicial = (params?.pageId as string) ?? '';
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const resumen = useResumenSitio();
  const permisos = resumen.datos?.permisos ?? { editar: false, publicar: false };
  /** URL pública del sitio principal (la de la organización). */
  const urlPublicaPrincipal = resumen.datos?.sitio.url ?? null;

  // ── Carga y página ──────────────────────────────────────────────────────────
  const [estadoCarga, setEstadoCarga] = useState<EstadoCargaEditor>('cargando');
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [currentPage, setCurrentPage] = useState<WebsitePageWithSections | null>(null);
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  /** Fila legacy tal como llegó de la base (qué columnas existen), para degradar al guardar. */
  const settingsRef = useRef<WebsiteSettings | null>(null);
  const [previewUrlBase, setPreviewUrlBase] = useState<string | null>(null);
  /**
   * Ya se sabe la dirección del sitio y de qué sede es la página abierta (la carga legacy terminó
   * de leerlas). El borrador V2 puede llegar antes: hasta entonces el lienzo espera.
   */
  const [direccionLista, setDireccionLista] = useState(false);
  const [sectionManifest, setSectionManifest] = useState<SectionManifest | null>(null);
  const [availableMenus, setAvailableMenus] = useState<MenuGroup[]>([]);
  const [previewEntities, setPreviewEntities] = useState<{ id: string; label: string }[]>([]);
  const [previewEntityId, setPreviewEntityId] = useState<string | null>(null);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  // ── Selección y lienzo ──────────────────────────────────────────────────────
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [zonaGlobal, setZonaGlobal] = useState<ZonaGlobal | null>(null);
  const [dispositivo, setDispositivo] = useState<DispositivoVista>('escritorio');

  // ── Sedes (legacy) ──────────────────────────────────────────────────────────
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [publishedBranches, setPublishedBranches] = useState<Branch[]>([]);
  const [todasSucursales, setTodasSucursales] = useState<Branch[]>([]);
  /** Ya llegaron las sedes (o falló su carga): hasta entonces no se sabe la dirección de una sede. */
  const [sucursalesListas, setSucursalesListas] = useState(false);
  const [, setOutletSettingsExists] = useState(true);

  // ── Guardado legacy (por lotes, «Guardar y publicar») ──────────────────────
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingSectionUpdates = useRef<Map<string, Partial<WebsitePageSection>>>(new Map());
  const pendingSettingsUpdates = useRef<Partial<WebsiteSettings>>({});
  const pendingPageUpdates = useRef<Partial<WebsitePage>>({});
  const pendingPageSettings = useRef<Record<string, unknown> | null>(null);
  const pendingMenuUpdates = useRef<Map<string, Record<string, unknown>>>(new Map());

  // ── V2 ──────────────────────────────────────────────────────────────────────
  const [sitioBranch, setSitioBranch] = useState<number | null>(null);
  const [forzarLegacy, setForzarLegacy] = useState(false);
  const [paginaEsDeSede, setPaginaEsDeSede] = useState(false);
  const [sitios, setSitios] = useState<SitioResumen[]>([]);
  const [apiV2, setApiV2] = useState(false);
  const v2 = useSitioV2({ branchId: sitioBranch, deshabilitado: !organizationId || !permisos.editar });
  const enV2 = !forzarLegacy && !paginaEsDeSede && v2.borrador !== null;
  const esSedeV2 = enV2 && sitioBranch !== null;
  const [docLocal, setDocLocal] = useState<DocumentoSitio | null>(null);
  /** Sitio cuyo borrador está cargado en la vista (`undefined` = ninguno aún). */
  const [sitioCargado, setSitioCargado] = useState<number | null | undefined>(undefined);
  const [ajustesLegacyPrincipal, setAjustesLegacyPrincipal] = useState<WebsiteSettings | null>(null);
  const [estadoGuardado, setEstadoGuardado] = useState<EstadoGuardado>('guardado');
  const [seccionesPersonalizadas, setSeccionesPersonalizadas] = useState<Set<string>>(new Set());
  const [programacion, setProgramacion] = useState<ProgramacionPublicacion | null>(null);
  const [programarDisponible, setProgramarDisponible] = useState<boolean | null>(null);
  const [vistaVersion, setVistaVersion] = useState<RevisionConDocumento | null>(null);
  const [conflicto, setConflicto] = useState<ConflictoEditor | null>(null);
  const [publicando, setPublicando] = useState(false);
  /** Documento de la revisión en línea: lista de cambios del diálogo Publicar y conteo de la píldora. */
  const [documentoPublicado, setDocumentoPublicado] = useState<DocumentoSitio | null>(null);
  const [ultimaPublicacion, setUltimaPublicacion] = useState<{ en: string; autor: string | null } | null>(null);
  const docLocalRef = useRef<DocumentoSitio | null>(null);
  docLocalRef.current = docLocal;
  const currentPageRef = useRef<WebsitePageWithSections | null>(null);
  currentPageRef.current = currentPage;
  /** Documento que acabamos de guardar nosotros: cuando el hook lo devuelve, no se recarga la vista. */
  const ultimoGuardadoRef = useRef<DocumentoSitio | null>(null);
  const autoguardadoRef = useRef<Autoguardado | null>(null);
  const paginaPreferidaRef = useRef<string | null>(pageIdInicial);

  // «Faltan datos»: conteos reales del ERP por fuente (A/05b, A/05e).
  const sedeConteo = enV2 ? sitioBranch : selectedBranchId;
  const { conteos: conteoFuentes, recargar: recargarConteoFuentes } = useConteoFuentes(Boolean(organizationId), sedeConteo);
  const sucursalesWeb = sucursalesListas ? todasSucursales : null;
  /**
   * «Ver sitio publicado» del sitio elegido: con una sede, la URL pública de ESA sede
   * (`baseWebDeSede`); `null` si el sitio no la sirve aparte o mientras llegan las sedes.
   */
  const urlPublica = useMemo(
    () => urlPublicaSitio(urlPublicaPrincipal, sedeConteo, sucursalesWeb),
    [urlPublicaPrincipal, sedeConteo, sucursalesWeb],
  );

  // Undo / redo sobre las secciones (useHistory existente, 50 pasos).
  const {
    state: sectionsState,
    set: setSectionsState,
    undo,
    redo,
    reset: resetSections,
    canUndo,
    canRedo,
  } = useHistory<WebsitePageSection[]>([]);

  const marcarCambio = useCallback(() => {
    setHasChanges(true);
    setEstadoGuardado('cambios');
    autoguardadoRef.current?.programar();
  }, []);

  // ── Carga inicial ───────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!organizationId) return;
    // El borrador V2 puede llegar antes que esta carga: si ya entró (docLocal), la página, la
    // lista de páginas y el estado son suyos y esta carga no los pisa. Sin esta guarda, una
    // página que solo existe en el borrador (p. ej. una recién creada) volvía a «cargando» y el
    // editor se quedaba en el esqueleto para siempre.
    const yaEnV2 = () => docLocalRef.current !== null;
    if (!yaEnV2()) setEstadoCarga('cargando');
    try {
      const pageData = await websitePageBuilderService.getPageWithSections(pageIdInicial).catch(() => null);
      const branchDePagina = (pageData as WebsitePage | null)?.branch_id ?? null;
      setSelectedBranchId(branchDePagina);
      setPaginaEsDeSede(branchDePagina !== null);
      if (!yaEnV2()) {
        setCurrentPage(pageData);
        if (pageData) resetSections(pageData.sections);
      }

      const [pagesData, settingsRaw, preview] = await Promise.all([
        websitePageBuilderService.getPages(organizationId, branchDePagina),
        websiteSettingsService.getSettings(organizationId, branchDePagina),
        websitePageBuilderService.getPreviewUrl(organizationId),
      ]);
      let settingsData = settingsRaw;
      let propios = true;
      if (!settingsData && branchDePagina !== null) {
        settingsData = await websiteSettingsService.getSettings(organizationId, null);
        propios = false;
      }
      setOutletSettingsExists(propios);
      if (!yaEnV2()) setPages(pagesData);
      settingsRef.current = settingsData;
      setSettings(settingsData);
      setPreviewUrlBase(preview);
      setDireccionLista(true);

      try {
        const sucursales = await branchService.getBranches(organizationId);
        setTodasSucursales(sucursales);
        setPublishedBranches(sucursales.filter((b) => b.is_web_published === true && !!b.branch_type));
      } catch {
        setTodasSucursales([]);
      }
      setSucursalesListas(true);
      try {
        setAvailableMenus(await websiteMenuGroupService.getMenus(organizationId));
      } catch {
        // Puede no haber menús nombrados aún.
      }
      try {
        setSitios(await clienteSitiosV2.listar());
        setApiV2(true);
      } catch {
        setApiV2(false);
      }
      // Sin página legacy puede ser una página creada en el borrador V2: se decide al llegar el borrador.
      if (!yaEnV2()) setEstadoCarga(pageData ? 'listo' : 'cargando');
    } catch (error) {
      console.error('[editor] carga', mensaje(error, ''));
      setEstadoCarga('error');
    }
  }, [organizationId, pageIdInicial, resetSections]);

  const hayResumen = !!resumen.datos;
  const puedeEditar = !!resumen.datos?.permisos.editar;
  useEffect(() => {
    if (resumen.fallo === 'sin_permiso') {
      setEstadoCarga('sin_permiso');
      return;
    }
    if (resumen.fallo === 'error') {
      setEstadoCarga('error');
      return;
    }
    if (!hayResumen) return;
    if (!puedeEditar) {
      setEstadoCarga('sin_permiso');
      return;
    }
    void cargar();
  }, [cargar, hayResumen, puedeEditar, resumen.fallo]);

  // Sin página legacy y sin borrador V2 que la tenga: no existe (o es de otra organización).
  useEffect(() => {
    if (estadoCarga !== 'cargando' || currentPage || v2.cargando || !hayResumen || !settings) return;
    if (!v2.borrador) setEstadoCarga('no_encontrada');
  }, [estadoCarga, currentPage, v2.cargando, v2.borrador, hayResumen, settings]);

  // ── Entrar en V2 / recargar la vista desde el borrador ─────────────────────
  useEffect(() => {
    const borrador = v2.borrador;
    if (!borrador || forzarLegacy || paginaEsDeSede || !organizationId) return;
    if (borrador.documento === ultimoGuardadoRef.current && docLocalRef.current) return;
    const documento = borrador.documento;
    const ctx = { organizationId, branchId: borrador.sitio.branchId };
    const vistas = paginasDesdeDocumento(documento, ctx);
    const preferida = currentPageRef.current?.id ?? paginaPreferidaRef.current;
    const pagina =
      vistas.find((p) => p.id === preferida) ?? vistas.find((p) => p.slug === 'home') ?? vistas[0] ?? null;
    const cambiaDePagina = currentPageRef.current?.id !== pagina?.id;
    ultimoGuardadoRef.current = borrador.documento;
    setSitioCargado(borrador.sitio.branchId);
    setDocLocal(documento);
    setPages(vistas);
    setCurrentPage(pagina);
    if (pagina) resetSections(pagina.sections);
    if (cambiaDePagina) {
      setActiveSectionId(null);
      setZonaGlobal(null);
    }
    setSeccionesPersonalizadas(new Set());
    pendingSectionUpdates.current.clear();
    pendingPageUpdates.current = {};
    pendingPageSettings.current = null;
    autoguardadoRef.current?.reiniciar();
    setHasChanges(false);
    setEstadoGuardado('guardado');
    setPreviewRefreshKey((k) => k + 1);
    setEstadoCarga(pagina ? 'listo' : 'no_encontrada');
    if (pagina && typeof window !== 'undefined') {
      window.history.replaceState(null, '', `${rutaEditorSitio(pagina.id)}${window.location.search}`);
    }
    // Los ajustes que no van al documento (operación) salen de la fila legacy del principal.
    if (!ajustesLegacyPrincipal) {
      void websiteSettingsService
        .getSettings(organizationId, null)
        .then((legacy) => setAjustesLegacyPrincipal(legacy))
        .catch(() => undefined);
    }
  }, [v2.borrador, forzarLegacy, paginaEsDeSede, organizationId, resetSections, ajustesLegacyPrincipal]);

  // Ajustes que ve el editor en V2 (documento + operación de la fila legacy).
  const vistaAjustes = useMemo(() => {
    if (!enV2 || !docLocal) return null;
    return ajustesDesdeDocumento(docLocal, ajustesLegacyPrincipal ?? ({} as WebsiteSettings), v2.borrador?.basePrincipal?.documento ?? null);
  }, [enV2, docLocal, ajustesLegacyPrincipal, v2.borrador]);
  const settingsVista: WebsiteSettings | null = enV2 ? vistaAjustes?.ajustes ?? null : settings;

  // Undo/redo → página en edición.
  useEffect(() => {
    setCurrentPage((prev) => {
      if (!prev) return prev;
      if (JSON.stringify(prev.sections) === JSON.stringify(sectionsState)) return prev;
      return { ...prev, sections: sectionsState };
    });
  }, [sectionsState]);

  // Manifiesto del sitio (secciones desincronizadas). No es crítico.
  useEffect(() => {
    if (!previewUrlBase) return;
    let vigente = true;
    fetch(`${previewUrlBase}/api/_sections/manifest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SectionManifest | null) => vigente && setSectionManifest(d))
      .catch(() => vigente && setSectionManifest(null));
    return () => {
      vigente = false;
    };
  }, [previewUrlBase]);

  // Entidades de ejemplo para las plantillas de detalle (F9.4).
  const tipoPagina = currentPage?.page_type;
  useEffect(() => {
    if (!organizationId || !tipoPagina || !['product_detail', 'category_detail', 'space_detail'].includes(tipoPagina)) {
      setPreviewEntities([]);
      setPreviewEntityId(null);
      return;
    }
    let vigente = true;
    websitePageBuilderService
      .getPreviewEntities(organizationId, tipoPagina)
      .then((e) => {
        if (!vigente) return;
        setPreviewEntities(e);
        if (e.length > 0) setPreviewEntityId((a) => a ?? e[0].id);
      })
      .catch(() => vigente && setPreviewEntities([]));
    return () => {
      vigente = false;
    };
  }, [organizationId, tipoPagina]);

  // Programación pendiente del sitio V2 (A/05g): si la migración no está, «Programar» se apaga.
  const sitioId = v2.sitio?.id ?? null;
  const leerProgramacion = useCallback(async () => {
    if (!sitioId) return;
    try {
      const lista = await clienteSitiosV2.programaciones(sitioId);
      setProgramarDisponible(true);
      setProgramacion(lista.find((p) => p.estado === 'pendiente') ?? null);
    } catch (error) {
      setProgramarDisponible(!(error instanceof ErrorApiSitio && error.codigo === 'no_disponible'));
      setProgramacion(null);
    }
  }, [sitioId]);
  useEffect(() => {
    if (enV2) void leerProgramacion();
  }, [enV2, leerProgramacion]);

  const revisionEnLinea = enV2 ? v2.sitio?.revisionPublicadaId ?? null : null;
  useEffect(() => {
    if (!sitioId || !revisionEnLinea) {
      setDocumentoPublicado(null);
      setUltimaPublicacion(null);
      return;
    }
    let vigente = true;
    clienteSitiosV2
      .revision(sitioId, revisionEnLinea)
      .then((r) => {
        if (!vigente) return;
        setDocumentoPublicado(r.documento);
        setUltimaPublicacion({ en: r.publicadaEn, autor: r.autor });
      })
      .catch(() => vigente && setDocumentoPublicado(null));
    return () => {
      vigente = false;
    };
  }, [sitioId, revisionEnLinea]);

  // ── Documento actual (V2) ───────────────────────────────────────────────────
  const documentoActual = useCallback((): DocumentoSitio | null => {
    const doc = docLocalRef.current;
    if (!doc) return null;
    const pagina = currentPageRef.current;
    return pagina ? aplicarPaginaAlDocumento(doc, pagina) : doc;
  }, []);

  // ── Autoguardado V2 (A/05m) ────────────────────────────────────────────────
  const guardarV2 = useCallback(async (): Promise<boolean> => {
    const documento = documentoActual();
    if (!documento || !organizationId) return false;
    setEstadoGuardado('guardando');
    ultimoGuardadoRef.current = documento;
    const ok = await v2.guardar(() => documento);
    if (!ok) {
      ultimoGuardadoRef.current = null;
      setEstadoGuardado('error');
      return false;
    }
    // Operación (envío, contador, botones…): no va al documento (D12); en el principal sigue en su fila legacy.
    const operacion = { ...pendingSettingsUpdates.current };
    pendingSettingsUpdates.current = {};
    if (Object.keys(operacion).length > 0 && sitioBranch === null) {
      try {
        setAjustesLegacyPrincipal(await websiteSettingsService.updateSettings(organizationId, operacion, null));
      } catch (error) {
        toast.error(t('guardado.errorOperacion'), { description: mensaje(error, '') });
      }
    } else if (Object.keys(operacion).length > 0) {
      toast(t('guardado.operacionSoloPrincipal'));
    }
    setDocLocal(documento);
    // Si hubo cambios mientras se guardaba, el autoguardado vuelve a programarse solo.
    if (!autoguardadoRef.current?.pendiente()) {
      setHasChanges(false);
      setEstadoGuardado('guardado');
    }
    void clienteSitiosV2.listar().then(setSitios).catch(() => undefined);
    return true;
  }, [documentoActual, organizationId, v2, sitioBranch, t]);

  const guardarV2Ref = useRef(guardarV2);
  guardarV2Ref.current = guardarV2;
  if (!autoguardadoRef.current) {
    autoguardadoRef.current = programarAutoguardado(() => guardarV2Ref.current(), ESPERA_AUTOGUARDADO_MS);
  }
  useEffect(() => () => autoguardadoRef.current?.cancelar(), []);
  // El autoguardado solo corre en V2: en legacy guardar es publicar.
  useEffect(() => {
    autoguardadoRef.current?.habilitar(enV2);
  }, [enV2]);

  // Error de guardado (no conflicto): aviso persistente con «Reintentar» (D/05-26).
  const errorV2 = v2.error && !v2.error.esConflicto && estadoGuardado === 'error' ? v2.error.message : null;
  useEffect(() => {
    if (!errorV2) return;
    toast.error(t('guardado.errorTitulo'), {
      id: 'editor-error-guardado',
      description: t('guardado.errorDescripcion'),
      duration: Infinity,
      action: { label: t('acciones.reintentar'), onClick: () => void autoguardadoRef.current?.ahora() },
    });
  }, [errorV2, t]);

  // Conflicto: otra persona guardó o publicó (409). Se busca quién y cuándo (A/05i).
  useEffect(() => {
    if (!v2.conflicto || !v2.sitio) {
      setConflicto(null);
      return;
    }
    autoguardadoRef.current?.cancelar();
    setEstadoGuardado('error');
    let vigente = true;
    const puedeCombinar = !!v2.borrador?.revisionBaseId;
    setConflicto({ autor: null, cuando: null, publicado: false, puedeCombinar });
    void clienteSitiosV2
      .revisiones(v2.sitio.id)
      .then((lista) => {
        if (!vigente) return;
        const ultima = lista[0];
        const cargadoEn = v2.borrador?.actualizadoEn ?? null;
        const publicadoDespues = !!ultima && (!cargadoEn || ultima.publicadaEn > cargadoEn);
        setConflicto({
          autor: publicadoDespues ? ultima.autor : null,
          cuando: publicadoDespues ? ultima.publicadaEn : null,
          publicado: publicadoDespues,
          puedeCombinar,
        });
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [v2.conflicto, v2.sitio, v2.borrador]);

  // ── Selección ───────────────────────────────────────────────────────────────
  const seleccionarSeccion = useCallback((id: string | null) => {
    setActiveSectionId(id);
    if (id) setZonaGlobal(null);
  }, []);
  const seleccionarZona = useCallback((zona: ZonaGlobal | null) => {
    setZonaGlobal(zona);
    if (zona) setActiveSectionId(null);
  }, []);

  // ── Edición de secciones (memoria; legacy por lotes, V2 autoguardado) ───────
  const actualizarSecciones = useCallback(
    (siguiente: WebsitePageSection[], pendientes?: { id: string; cambios: Partial<WebsitePageSection> }[]) => {
      // La referencia se adelanta al render: varios cambios seguidos (o un guardado inmediato) ven el último.
      if (currentPageRef.current) currentPageRef.current = { ...currentPageRef.current, sections: siguiente };
      setCurrentPage((prev) => (prev ? { ...prev, sections: siguiente } : prev));
      setSectionsState(siguiente);
      for (const p of pendientes ?? []) {
        const previo = pendingSectionUpdates.current.get(p.id) ?? {};
        pendingSectionUpdates.current.set(p.id, { ...previo, ...p.cambios });
      }
      marcarCambio();
    },
    [setSectionsState, marcarCambio],
  );

  /**
   * Primer cambio sobre una sección heredada mientras se edita una sede: se retiene y se pregunta
   * «¿Cambiar solo en <Sede> o en todas las sedes?». Nunca se separa la sede en silencio.
   */
  const [preguntaSede, setPreguntaSede] = useState<{ seccionId: string; operacion: OperacionSede } | null>(null);
  /** «En todas»: la operación retenida se aplica en el sitio principal cuando termine de cargar. */
  const cambioParaPrincipalRef = useRef<{ paginaId: string; seccionId: string; operacion: OperacionSede } | null>(null);
  /** Ámbito de cada sección en la sede (se fija más abajo; ref para no depender del orden). */
  const ambitoRef = useRef<(id: string) => AmbitoSede | undefined>(() => undefined);

  const aplicarCambioSeccion = useCallback(
    (id: string, cambio: (s: WebsitePageSection) => WebsitePageSection) => {
      const pagina = currentPageRef.current;
      if (!pagina) return;
      let cambios: Partial<WebsitePageSection> = {};
      const siguiente = pagina.sections.map((s) => {
        if (s.id !== id) return s;
        const nueva = cambio(s);
        cambios = {
          ...(nueva.content !== s.content ? { content: nueva.content } : {}),
          ...(nueva.section_variant !== s.section_variant ? { section_variant: nueva.section_variant } : {}),
          ...(nueva.settings !== s.settings ? { settings: nueva.settings } : {}),
          ...(nueva.is_visible !== s.is_visible ? { is_visible: nueva.is_visible } : {}),
        };
        return nueva;
      });
      actualizarSecciones(siguiente, [{ id, cambios }]);
    },
    [actualizarSecciones],
  );

  const cambiarSeccion = useCallback(
    (id: string, cambio: (s: WebsitePageSection) => WebsitePageSection) => {
      if (ambitoRef.current(id) === 'heredada') {
        setPreguntaSede({ seccionId: id, operacion: { tipo: 'cambio', cambio } });
        return;
      }
      aplicarCambioSeccion(id, cambio);
    },
    [aplicarCambioSeccion],
  );

  const cambiarContenido = useCallback(
    (id: string, content: Record<string, unknown>) => cambiarSeccion(id, (s) => ({ ...s, content })),
    [cambiarSeccion],
  );
  const cambiarVariante = useCallback(
    (id: string, variante: string) => cambiarSeccion(id, (s) => ({ ...s, section_variant: variante })),
    [cambiarSeccion],
  );
  const alternarVisible = useCallback(
    (id: string, visible: boolean) => cambiarSeccion(id, (s) => alternarVisibleTodo(s, visible)),
    [cambiarSeccion],
  );
  const cambiarVisibilidad = useCallback(
    (id: string, v: Visibilidad) => cambiarSeccion(id, (s) => aplicarVisibilidad(s, v)),
    [cambiarSeccion],
  );
  /** Estilo de la sección (figma-estilo): `null` = «Restablecer el estilo de la sección». */
  const cambiarEstilo = useCallback(
    (id: string, estilo: EstiloSeccion | null) =>
      cambiarSeccion(id, (s) => ({ ...s, settings: escribirEstiloSeccion(s.settings, estilo) })),
    [cambiarSeccion],
  );

  const indiceInsercion = useCallback((): number => {
    const pagina = currentPageRef.current;
    if (!pagina) return 0;
    const i = activeSectionId ? pagina.sections.findIndex((s) => s.id === activeSectionId) : -1;
    return i >= 0 ? i + 1 : pagina.sections.length;
  }, [activeSectionId]);

  const anadirSeccion = useCallback(
    async (tipo: string, variante: string) => {
      const pagina = currentPageRef.current;
      if (!pagina || !organizationId) return;
      const posicion = indiceInsercion();
      const etiqueta = getSectionDefinition(tipo)?.label ?? tipo;
      if (enV2) {
        const nueva: WebsitePageSection = {
          id: nuevoIdSeccion(),
          page_id: pagina.id,
          organization_id: organizationId,
          section_type: tipo,
          section_variant: variante,
          content: {},
          settings: {},
          sort_order: posicion,
          is_visible: true,
          created_at: '',
          updated_at: '',
          branch_id: sitioBranch,
        };
        const lista = [...pagina.sections];
        lista.splice(posicion, 0, nueva);
        actualizarSecciones(lista.map((s, i) => ({ ...s, sort_order: i })));
        setActiveSectionId(nueva.id);
        setZonaGlobal(null);
        toast.success(esSedeV2 ? t('toast.seccionSede', { seccion: etiqueta }) : t('toast.seccionBorrador', { seccion: etiqueta }));
        return;
      }
      try {
        const creada = await websitePageBuilderService.addSection({
          page_id: pagina.id,
          organization_id: organizationId,
          section_type: tipo,
          section_variant: variante,
          sort_order: posicion,
        });
        const lista = [...pagina.sections];
        lista.splice(Math.min(posicion, lista.length), 0, creada);
        const ordenadas = lista.map((s, i) => ({ ...s, sort_order: i }));
        setCurrentPage((prev) => (prev ? { ...prev, sections: ordenadas } : prev));
        setSectionsState(ordenadas);
        if (posicion !== pagina.sections.length) marcarCambio();
        setActiveSectionId(creada.id);
        setZonaGlobal(null);
        toast.success(t('toast.seccionAnadida', { seccion: etiqueta }));
      } catch (error) {
        toast.error(t('toast.errorAnadir'), { description: mensaje(error, '') });
      }
    },
    [organizationId, indiceInsercion, enV2, sitioBranch, actualizarSecciones, esSedeV2, t, setSectionsState, marcarCambio],
  );

  const ejecutarEliminar = useCallback(
    async (id: string) => {
      const pagina = currentPageRef.current;
      if (!pagina) return;
      const restantes = pagina.sections.filter((s) => s.id !== id);
      if (enV2) {
        pendingSectionUpdates.current.delete(id);
        actualizarSecciones(restantes);
      } else {
        try {
          await websitePageBuilderService.deleteSection(id);
          pendingSectionUpdates.current.delete(id);
          setCurrentPage((prev) => (prev ? { ...prev, sections: restantes } : prev));
          setSectionsState(restantes);
          toast.success(t('toast.seccionEliminada'));
        } catch (error) {
          toast.error(t('toast.errorEliminar'), { description: mensaje(error, '') });
          return;
        }
      }
      if (activeSectionId === id) setActiveSectionId(null);
    },
    [enV2, actualizarSecciones, activeSectionId, setSectionsState, t],
  );

  /**
   * Quitar una sección que la sede comparte con el principal también la separa: se pregunta
   * igual que al cambiarla. Duplicar no pregunta: la copia es nueva y solo de esta sede.
   */
  const eliminarSeccion = useCallback(
    async (id: string) => {
      if (ambitoRef.current(id) === 'heredada') {
        setPreguntaSede({ seccionId: id, operacion: { tipo: 'eliminar' } });
        return;
      }
      await ejecutarEliminar(id);
    },
    [ejecutarEliminar],
  );

  const duplicarSeccion = useCallback(
    async (id: string) => {
      const pagina = currentPageRef.current;
      if (!pagina || !organizationId) return;
      const i = pagina.sections.findIndex((s) => s.id === id);
      if (i < 0) return;
      let copia: WebsitePageSection;
      if (enV2) {
        const original = pagina.sections[i];
        copia = {
          ...original,
          id: nuevoIdSeccion(),
          content: JSON.parse(JSON.stringify(original.content ?? {})),
          settings: JSON.parse(JSON.stringify(original.settings ?? {})),
        };
      } else {
        try {
          copia = await websitePageBuilderService.duplicateSection(id);
        } catch (error) {
          toast.error(t('toast.errorDuplicar'), { description: mensaje(error, '') });
          return;
        }
      }
      const lista = [...pagina.sections];
      lista.splice(i + 1, 0, copia);
      actualizarSecciones(lista.map((s, n) => ({ ...s, sort_order: n })));
      setActiveSectionId(copia.id);
      toast.success(t('toast.seccionDuplicada'));
    },
    [organizationId, enV2, actualizarSecciones, t],
  );

  const moverSeccion = useCallback(
    (desde: number, hasta: number) => {
      const pagina = currentPageRef.current;
      if (!pagina || desde === hasta || hasta < 0 || hasta >= pagina.sections.length) return;
      const lista = [...pagina.sections];
      const [movida] = lista.splice(desde, 1);
      lista.splice(hasta, 0, movida);
      actualizarSecciones(lista.map((s, i) => ({ ...s, sort_order: i })));
    },
    [actualizarSecciones],
  );

  const materializarPorDefecto = useCallback(async () => {
    const pagina = currentPageRef.current;
    if (!pagina || !organizationId) return;
    const porDefecto = getDefaultSectionsForPageType(pagina.page_type);
    if (porDefecto.length === 0 || pagina.sections.length > 0) return;
    if (enV2) {
      actualizarSecciones(
        porDefecto.map((d, i) => ({
          id: nuevoIdSeccion(),
          page_id: pagina.id,
          organization_id: organizationId,
          section_type: d.section_type,
          section_variant: d.section_variant,
          content: {},
          settings: {},
          sort_order: i,
          is_visible: true,
          created_at: '',
          updated_at: '',
          branch_id: sitioBranch,
        })),
      );
      return;
    }
    try {
      await websitePageBuilderService.materializeDefaultSections(pagina.id, organizationId, porDefecto);
      const recargada = await websitePageBuilderService.getPageWithSections(pagina.id, organizationId, selectedBranchId);
      setCurrentPage(recargada);
      if (recargada?.sections) resetSections(recargada.sections);
      setPreviewRefreshKey((k) => k + 1);
    } catch (error) {
      toast.error(t('toast.errorPorDefecto'), { description: mensaje(error, '') });
    }
  }, [organizationId, enV2, actualizarSecciones, sitioBranch, selectedBranchId, resetSections, t]);

  // ── SEO y diseño de la página ──────────────────────────────────────────────
  const cambiarSeoPagina = useCallback(
    (cambios: { meta_title?: string; meta_description?: string; og_image_url?: string }) => {
      setCurrentPage((prev) => (prev ? { ...prev, ...cambios } : prev));
      pendingPageUpdates.current = { ...pendingPageUpdates.current, ...cambios };
      marcarCambio();
    },
    [marcarCambio],
  );
  const cambiarDisenoPagina = useCallback(
    (page_settings: Record<string, unknown>) => {
      setCurrentPage((prev) => (prev ? { ...prev, page_settings } : prev));
      pendingPageSettings.current = page_settings;
      marcarCambio();
    },
    [marcarCambio],
  );

  // ── Ajustes globales (encabezado, pie, tema) ───────────────────────────────
  const cambiarAjustes = useCallback(
    (cambios: Partial<WebsiteSettings>) => {
      if (enV2) {
        const doc = docLocalRef.current;
        if (!doc) return;
        const delDocumento: Record<string, unknown> = {};
        const operacion: Record<string, unknown> = {};
        for (const [clave, valor] of Object.entries(cambios)) {
          if (columnaVaAlDocumento(clave)) delDocumento[clave] = valor;
          else operacion[clave] = valor;
        }
        if (Object.keys(delDocumento).length > 0) {
          const nuevo = aplicarAjustesAlDocumento(doc, delDocumento).documento;
          docLocalRef.current = nuevo;
          setDocLocal(nuevo);
        }
        if (Object.keys(operacion).length > 0) {
          pendingSettingsUpdates.current = { ...pendingSettingsUpdates.current, ...(operacion as Partial<WebsiteSettings>) };
          setAjustesLegacyPrincipal((prev) => (prev ? { ...prev, ...(operacion as Partial<WebsiteSettings>) } : prev));
        }
        marcarCambio();
        return;
      }
      // Legacy: la fila de `website_settings`. Una columna nueva que aún no exista en la base no
      // se envía (el lienzo la pinta igual); la barra móvil va como texto «a,b».
      const { enviar } = cambiosParaFilaLegacy(cambios as Record<string, unknown>, settingsRef.current as unknown as Record<string, unknown> | null);
      setSettings((prev) => (prev ? { ...prev, ...cambios } : prev));
      pendingSettingsUpdates.current = { ...pendingSettingsUpdates.current, ...(enviar as Partial<WebsiteSettings>) };
      marcarCambio();
    },
    [enV2, marcarCambio],
  );

  /** Cambia el documento entero (estilo del sitio, menús): solo V2. */
  const cambiarDocumento = useCallback(
    (cambiar: (d: DocumentoSitio) => DocumentoSitio) => {
      const doc = docLocalRef.current;
      if (!doc) return;
      const nuevo = cambiar(doc);
      docLocalRef.current = nuevo;
      setDocLocal(nuevo);
      marcarCambio();
    },
    [marcarCambio],
  );

  const cambiarItemsMenu = useCallback(
    (menuId: string, items: ItemMenu[]) => cambiarDocumento((d) => reemplazarItemsMenu(d, menuId, items)),
    [cambiarDocumento],
  );

  // ── Cambio de página ────────────────────────────────────────────────────────
  const cambiarPagina = useCallback(
    async (id: string) => {
      if (enV2) {
        const doc = documentoActual();
        if (!doc || !organizationId) return;
        const pagina = doc.paginas.find((p) => p.id === id);
        if (!pagina) return;
        const vista = paginaAVista(pagina, { organizationId, branchId: sitioBranch });
        setDocLocal(doc);
        setPages(paginasDesdeDocumento(doc, { organizationId, branchId: sitioBranch }));
        setCurrentPage(vista);
        resetSections(vista.sections);
        setActiveSectionId(null);
        setPreviewRefreshKey((k) => k + 1);
        window.history.replaceState(null, '', rutaEditorSitio(id));
        return;
      }
      pendingSectionUpdates.current.clear();
      pendingSettingsUpdates.current = {};
      pendingPageUpdates.current = {};
      setHasChanges(false);
      setEstadoGuardado('guardado');
      setActiveSectionId(null);
      try {
        const datos = await websitePageBuilderService.getPageWithSections(id, organizationId, selectedBranchId);
        setCurrentPage(datos);
        if (datos) resetSections(datos.sections);
        setPreviewRefreshKey((k) => k + 1);
        window.history.replaceState(null, '', rutaEditorSitio(id));
      } catch {
        toast.error(t('toast.errorPagina'));
      }
    },
    [enV2, documentoActual, organizationId, sitioBranch, resetSections, selectedBranchId, t],
  );

  // ── Guardar legacy («Guardar y publicar») ──────────────────────────────────
  const guardarLegacy = useCallback(async (): Promise<boolean> => {
    const pagina = currentPageRef.current;
    if (!organizationId || !pagina) return false;
    if (selectedBranchId === null && sitios.some((s) => s.branchId === null && s.v2Adoptado)) {
      toast.error(t('toast.sitioUsaV2'));
      return false;
    }
    if (!permisos.publicar) {
      toast.error(t('barra.sinPermisoPublicar'));
      return false;
    }
    setIsSaving(true);
    setEstadoGuardado('guardando');
    try {
      // Un solo lote al servidor: organización de la sesión, permisos de editar y publicar
      // exigidos allí y escritura en un paso (src/lib/website/editorLegacy.server.ts).
      const lote = armarLoteLegacy({
        pagina,
        sedeId: selectedBranchId,
        secciones: pendingSectionUpdates.current as Map<string, Record<string, unknown>>,
        paginaCambios: pendingPageUpdates.current as Record<string, unknown>,
        paginaAjustes: pendingPageSettings.current,
        ajustes: pendingSettingsUpdates.current as Record<string, unknown>,
        menus: pendingMenuUpdates.current,
      });
      const r = await clienteSitiosV2.guardarLegacy(lote);
      if (r.ajustes) {
        settingsRef.current = r.ajustes as unknown as WebsiteSettings;
        setSettings(r.ajustes as unknown as WebsiteSettings);
        if (selectedBranchId !== null) setOutletSettingsExists(true);
      }
      pendingSectionUpdates.current.clear();
      pendingSettingsUpdates.current = {};
      pendingPageUpdates.current = {};
      pendingPageSettings.current = null;
      pendingMenuUpdates.current.clear();
      setHasChanges(false);
      setEstadoGuardado('guardado');
      setPreviewRefreshKey((k) => k + 1);
      revalidarSitioPublico();
      toast.success(t('toast.guardadoLegacy'));
      return true;
    } catch (error) {
      setEstadoGuardado('error');
      toast.error(t('guardado.errorTitulo'), {
        description: mensaje(error, t('guardado.errorDescripcion')),
        duration: Infinity,
        action: { label: t('acciones.reintentar'), onClick: () => void guardarLegacyRef.current() },
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [organizationId, selectedBranchId, sitios, permisos.publicar, t]);
  const guardarLegacyRef = useRef(guardarLegacy);
  guardarLegacyRef.current = guardarLegacy;

  /** Ctrl+S: en V2 fuerza el autoguardado; en legacy guarda y publica. */
  const guardarAhora = useCallback(async (): Promise<boolean> => {
    if (enV2) return (await autoguardadoRef.current?.ahora()) ?? true;
    return hasChanges ? guardarLegacy() : true;
  }, [enV2, hasChanges, guardarLegacy]);

  /** Versión vigente del borrador en el servidor (tras un guardado, la del cierre ya es vieja). */
  const versionServidor = useCallback(async (): Promise<number | null> => {
    const id = v2.sitio?.id;
    if (!id) return null;
    return (await clienteSitiosV2.borrador(id)).version;
  }, [v2.sitio]);

  // ── Publicar (V2) ───────────────────────────────────────────────────────────
  /** `cambiarAdopcion` se declara más abajo; el aviso de «Publicado» la llama por aquí. */
  const cambiarAdopcionRef = useRef<((adoptado: boolean) => Promise<boolean>) | null>(null);
  const publicar = useCallback(
    async (opciones: { nota: string | null; tambienPrincipal?: boolean }): Promise<boolean> => {
      if (!enV2) return guardarLegacy();
      setPublicando(true);
      try {
        if (!(await guardarAhora())) return false;
        if (opciones.tambienPrincipal && esSedeV2) {
          const principal = sitios.find((s) => s.branchId === null);
          if (principal) {
            const b = await clienteSitiosV2.borrador(principal.id);
            await clienteSitiosV2.publicar(principal.id, b.version, null);
          }
        }
        // Primera publicación con el lector listo: la misma llamada activa la web (principal o
        // sede). Si ya está activa o el lector no está desplegado, publicar es como siempre.
        const v2AdoptadoAntes = !!v2.sitio?.v2Adoptado;
        const activar = debeActivarAlPublicar({ v2Adoptado: v2AdoptadoAntes, lectorListo: LECTOR_PUBLICO_V2_LISTO });
        const r = await v2.publicar(opciones.nota, { activar });
        if (!r) {
          if (!v2.conflicto) toast.error(t('publicar.error'), { description: v2.error?.message });
          return false;
        }
        setProgramacion(null);
        void clienteSitiosV2.listar().then(setSitios).catch(() => undefined);
        const aviso = avisoTrasPublicar({ v2AdoptadoAntes, activacion: r.activacion });
        if (aviso.tipo === 'web_actualizada') {
          toast.success(r.idempotente && !aviso.activadaAhora ? t('publicar.yaPublicada') : t('publicar.webActualizada'), {
            ...(urlPublica
              ? { action: { label: t('barra.verPublicado'), onClick: () => window.open(urlPublica, '_blank', 'noopener,noreferrer') } }
              : {}),
          });
        } else if (aviso.tipo === 'fallo_activar') {
          // La revisión quedó publicada; solo falta activarla: el aviso ofrece el reintento.
          toast.warning(t('publicar.activarFalloTitulo', { n: r.numero }), {
            description: t('publicar.activarFalloDescripcion'),
            duration: 20_000,
            ...(permisos.publicar
              ? { action: { label: t('adopcion.activar'), onClick: () => void cambiarAdopcionRef.current?.(true) } }
              : {}),
          });
        } else {
          toast.success(r.idempotente ? t('publicar.yaPublicada') : t('publicar.listo', { n: r.numero }), {
            description: t('publicar.listoSinAdoptar'),
          });
        }
        return true;
      } catch (error) {
        toast.error(t('publicar.error'), { description: mensaje(error, '') });
        return false;
      } finally {
        setPublicando(false);
      }
    },
    [enV2, guardarLegacy, guardarAhora, esSedeV2, sitios, v2, t, permisos.publicar, urlPublica],
  );

  /** Programar (A/05g). `ejecutarEn` en ISO ya convertido desde la zona de la organización. */
  const programar = useCallback(
    async (ejecutarEn: string, nota: string | null): Promise<boolean> => {
      if (!enV2 || !v2.sitio) return false;
      setPublicando(true);
      try {
        if (!(await guardarAhora())) return false;
        const version = await versionServidor();
        if (!version) return false;
        const p = await clienteSitiosV2.programar(v2.sitio.id, version, ejecutarEn, nota);
        setProgramacion(p);
        toast.success(t('publicar.programada'));
        return true;
      } catch (error) {
        toast.error(t('publicar.errorProgramar'), { description: mensaje(error, '') });
        return false;
      } finally {
        setPublicando(false);
      }
    },
    [enV2, v2.sitio, guardarAhora, versionServidor, t],
  );

  const cancelarProgramacion = useCallback(async () => {
    if (!v2.sitio || !programacion) return;
    try {
      await clienteSitiosV2.cancelarProgramacion(v2.sitio.id, programacion.id);
      setProgramacion(null);
      toast.success(t('publicar.programacionCancelada'));
    } catch (error) {
      toast.error(t('publicar.errorCancelar'), { description: mensaje(error, '') });
    }
  }, [v2.sitio, programacion, t]);

  // ── Historial: ver y restaurar (A/05h) ─────────────────────────────────────
  const verVersion = useCallback(
    async (revision: RevisionResumen) => {
      if (!v2.sitio) return;
      try {
        setVistaVersion(await clienteSitiosV2.revision(v2.sitio.id, revision.id));
      } catch (error) {
        toast.error(t('historial.errorVer'), { description: mensaje(error, '') });
      }
    },
    [v2.sitio, t],
  );

  const restaurar = useCallback(
    async (origen: { tipo: 'revision' | 'instantanea'; id: string; numero?: number }): Promise<boolean> => {
      if (!v2.sitio) return false;
      if (!(await guardarAhora())) return false;
      const actual = documentoActual();
      const version = await versionServidor();
      if (!version) return false;
      // Lo que había en el borrador queda como guardado automático (si la tabla ya existe).
      if (actual) void clienteSitiosV2.crearInstantanea(v2.sitio.id, actual, version, 'antes_de_restaurar').catch(() => undefined);
      try {
        if (origen.tipo === 'revision') await clienteSitiosV2.restaurar(v2.sitio.id, origen.id, version);
        else await clienteSitiosV2.restaurarInstantanea(v2.sitio.id, origen.id, version);
        setVistaVersion(null);
        await v2.recargar();
        toast.success(t('historial.restaurada'), { description: t('historial.restauradaDescripcion') });
        return true;
      } catch (error) {
        toast.error(t('historial.errorRestaurar'), { description: mensaje(error, '') });
        if (error instanceof ErrorApiSitio && error.esConflicto) await v2.recargar();
        return false;
      }
    },
    [v2, guardarAhora, documentoActual, versionServidor, t],
  );

  // ── Conflicto (A/05i) ───────────────────────────────────────────────────────
  /** Calcula la combinación; si hay choques los devuelve para elegir «la mía» o «la suya». */
  const prepararCombinacion = useCallback(
    async (elecciones: Record<string, Eleccion> = {}): Promise<{ documento: DocumentoSitio; choques: Choque[] } | null> => {
      const sitio = v2.sitio;
      const baseId = v2.borrador?.revisionBaseId;
      const local = documentoActual();
      if (!sitio || !baseId || !local) return null;
      const [base, servidor] = await Promise.all([clienteSitiosV2.revision(sitio.id, baseId), clienteSitiosV2.borrador(sitio.id)]);
      return combinarDocumentos(base.documento, servidor.documento, local, elecciones);
    },
    [v2.sitio, v2.borrador, documentoActual],
  );

  /**
   * Resuelve el conflicto. Combinar y «Publicar los míos» guardan sobre la versión vigente del
   * servidor (la que la otra persona dejó) y después el hook único relee el borrador; «Descartar»
   * deja mi borrador como guardado automático (si la tabla existe) y carga la versión nueva.
   */
  const resolverConflicto = useCallback(
    async (accion: 'combinar' | 'descartar' | 'sobrescribir', combinado?: DocumentoSitio): Promise<boolean> => {
      const sitio = v2.sitio;
      const local = documentoActual();
      if (!sitio || !local) return false;
      try {
        const servidor = await clienteSitiosV2.borrador(sitio.id);
        if (accion === 'descartar') {
          await clienteSitiosV2.crearInstantanea(sitio.id, local, servidor.version, 'descartado').catch(() => undefined);
          await v2.recargar();
          toast.success(t('conflicto.descartado'));
          return true;
        }
        const documento = accion === 'combinar' && combinado ? combinado : local;
        const guardado = await clienteSitiosV2.guardar(sitio.id, documento, servidor.version);
        if (accion === 'sobrescribir') {
          const r = await clienteSitiosV2.publicar(sitio.id, guardado.version, null);
          revalidarSitioPublico();
          toast.success(t('publicar.listo', { n: r.numero }));
        } else {
          toast.success(t('conflicto.combinado'));
        }
        await v2.recargar();
        return true;
      } catch (error) {
        toast.error(t('conflicto.error'), { description: mensaje(error, '') });
        return false;
      }
    },
    [v2, documentoActual, t],
  );

  // ── Sedes y herencia (D/05-13…05-28, figma-estilo 03/04) ───────────────────
  const sedes: SedeSelector[] = useMemo(
    () =>
      todasSucursales
        .filter((b) => typeof b.id === 'number')
        .map((b) => ({
          branchId: b.id as number,
          nombre: b.name,
          enLaWeb: b.is_web_published === true && !!b.branch_type,
          tieneSitio: sitios.some((s) => s.branchId === b.id),
        })),
    [todasSucursales, sitios],
  );

  const nombreSede = useCallback(
    (branchId: number | null) =>
      branchId === null ? t('sede.principal') : todasSucursales.find((b) => b.id === branchId)?.name ?? t('sede.generica', { id: branchId }),
    [todasSucursales, t],
  );
  const nombreSitio = enV2 ? nombreSede(sitioBranch) : nombreSede(selectedBranchId);
  /** `branch_type` de una sede (decide su plantilla: «Aplicar plantilla de <tipo>»). */
  const tipoDeSede = useCallback(
    (branchId: number | null) => (branchId === null ? null : todasSucursales.find((b) => b.id === branchId)?.branch_type ?? null),
    [todasSucursales],
  );
  /** Tras «Aplicar plantilla»: el borrador cambió en el servidor; se recarga (cae en Inicio). */
  const trasAplicarPlantilla = useCallback(async () => {
    await v2.recargar();
    setSitios(await clienteSitiosV2.listar());
  }, [v2]);

  /** Cambiar de sitio en V2 (el principal o una sede con sitio). Antes se guarda lo pendiente. */
  const elegirSitioV2 = useCallback(
    async (branchId: number | null): Promise<'listo' | 'crear'> => {
      if (enV2 && !(await guardarAhora())) return 'listo';
      if (branchId !== null && !sitios.some((s) => s.branchId === branchId)) return 'crear';
      setForzarLegacy(false);
      setPaginaEsDeSede(false);
      ultimoGuardadoRef.current = null;
      setActiveSectionId(null);
      setZonaGlobal(null);
      setSitioBranch(branchId);
      return 'listo';
    },
    [enV2, guardarAhora, sitios],
  );

  const crearSitioSede = useCallback(
    async (branchId: number | null): Promise<boolean> => {
      try {
        await clienteSitiosV2.crear(branchId);
        setSitios(await clienteSitiosV2.listar());
        setForzarLegacy(false);
        setPaginaEsDeSede(false);
        ultimoGuardadoRef.current = null;
        setSitioBranch(branchId);
        toast.success(branchId === null ? t('sede.borradorCreado') : t('sede.sitioCreado', { sede: nombreSede(branchId) }), {
          description: t('sede.nadaCambia'),
        });
        return true;
      } catch (error) {
        toast.error(t('sede.errorCrear'), { description: mensaje(error, '') });
        return false;
      }
    },
    [t, nombreSede],
  );

  /** Legacy: cambiar de sede recarga páginas y ajustes de esa sede. */
  const cambiarSedeLegacy = useCallback(
    async (branchId: number | null) => {
      if (!organizationId) return;
      setSelectedBranchId(branchId);
      pendingSectionUpdates.current.clear();
      pendingSettingsUpdates.current = {};
      setHasChanges(false);
      setEstadoGuardado('guardado');
      setActiveSectionId(null);
      try {
        const [paginas, propios] = await Promise.all([
          websitePageBuilderService.getPages(organizationId, branchId),
          websiteSettingsService.getSettings(organizationId, branchId),
        ]);
        let datos = propios;
        let existe = true;
        if (!datos && branchId !== null) {
          datos = await websiteSettingsService.getSettings(organizationId, null);
          existe = false;
        }
        setOutletSettingsExists(existe);
        setPages(paginas);
        settingsRef.current = datos;
        setSettings(datos);
        const actual = currentPageRef.current;
        if (paginas.length > 0 && (!actual || !paginas.some((p) => p.id === actual.id))) await cambiarPagina(paginas[0].id);
      } catch {
        toast.error(t('toast.errorSede'));
      }
    },
    [organizationId, cambiarPagina, t],
  );

  const salirDeV2 = useCallback(async () => {
    if (!(await guardarAhora())) return;
    setForzarLegacy(true);
    setDocLocal(null);
    await cargar();
  }, [guardarAhora, cargar]);

  const cambiarAdopcion = useCallback(
    async (adoptado: boolean) => {
      if (!v2.sitio) return false;
      try {
        await clienteSitiosV2.adopcion(v2.sitio.id, adoptado);
        await v2.recargar();
        setSitios(await clienteSitiosV2.listar());
        toast.success(adoptado ? t('adopcion.activada') : t('adopcion.desactivada'));
        return true;
      } catch (error) {
        toast.error(t('adopcion.error'), { description: mensaje(error, '') });
        return false;
      }
    },
    [v2, t],
  );
  cambiarAdopcionRef.current = cambiarAdopcion;

  const llevarMenu = useCallback(
    async (menuId: string) => {
      if (!v2.sitio) return;
      if (!(await guardarAhora())) return;
      try {
        const version = await versionServidor();
        if (!version) return;
        const r = await clienteSitiosV2.llevarMenu(v2.sitio.id, menuId, version);
        await v2.recargar();
        toast.success(r.copiado ? t('menu.copiado') : t('menu.actualizado'));
      } catch (error) {
        toast.error(t('menu.error'), { description: mensaje(error, '') });
      }
    },
    [v2, guardarAhora, versionServidor, t],
  );

  const basePrincipal = v2.borrador?.basePrincipal ?? null;
  const origenes = vistaAjustes?.origenes ?? {};
  const estadosSeccion: Record<string, EstadoSeccion> = useMemo(() => {
    if (!esSedeV2 || !docLocal || !basePrincipal || !currentPage) return {};
    return estadoSecciones(aplicarPaginaAlDocumento(docLocal, currentPage), basePrincipal.documento);
  }, [esSedeV2, docLocal, basePrincipal, currentPage]);

  const ambitoSeccion = useCallback(
    (id: string): AmbitoSede | undefined => {
      const e = estadosSeccion[id];
      if (e === 'nueva') return 'solo-esta-sede';
      if (e === 'propia') return 'personalizada';
      if (e === 'hereda') return seccionesPersonalizadas.has(id) ? 'personalizada' : 'heredada';
      return undefined;
    },
    [estadosSeccion, seccionesPersonalizadas],
  );

  const personalizarSeccion = useCallback((id: string) => setSeccionesPersonalizadas((p) => new Set(p).add(id)), []);
  ambitoRef.current = ambitoSeccion;

  const restablecerSeccionSede = useCallback(
    (id: string) => {
      const doc = docLocalRef.current;
      const pagina = currentPageRef.current;
      if (!doc || !basePrincipal || !pagina || !organizationId) return;
      const nuevo = restablecerSeccion(aplicarPaginaAlDocumento(doc, pagina), basePrincipal.documento, pagina.id, id);
      const p = nuevo.paginas.find((x) => x.id === pagina.id);
      if (!p) return;
      const vista = paginaAVista(p, { organizationId, branchId: sitioBranch });
      setDocLocal(nuevo);
      setCurrentPage(vista);
      setSectionsState(vista.sections);
      setSeccionesPersonalizadas((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
      marcarCambio();
    },
    [basePrincipal, organizationId, sitioBranch, setSectionsState, marcarCambio],
  );

  /** Sección del principal con el mismo id (para la herencia por grupo del estilo). */
  const seccionPrincipal = useCallback(
    (id: string): WebsitePageSection | null => {
      const pagina = currentPageRef.current;
      if (!basePrincipal || !pagina || !organizationId) return null;
      const p = basePrincipal.documento.paginas.find((x) => x.id === pagina.id);
      const i = p?.secciones.findIndex((s) => s.id === id) ?? -1;
      if (!p || i < 0) return null;
      return paginaAVista(p, { organizationId, branchId: null }).sections[i] ?? null;
    },
    [basePrincipal, organizationId],
  );

  const origenEstilo = useCallback(
    (s: WebsitePageSection): Record<GrupoEstilo, OrigenGrupo> | null => {
      if (!esSedeV2) return null;
      const p = seccionPrincipal(s.id);
      return origenGruposEstilo(comparableDe(s), p ? comparableDe(p) : null);
    },
    [esSedeV2, seccionPrincipal],
  );

  const restablecerGrupo = useCallback(
    (id: string, grupo: GrupoEstilo | 'todo') => {
      const p = seccionPrincipal(id);
      if (!p) return;
      cambiarSeccion(id, (s) => {
        if (grupo === 'todo') return aplicarComparable(s, comparableDe(p));
        return aplicarComparable(s, restablecerGrupoEstilo(comparableDe(s), comparableDe(p), grupo));
      });
    },
    [seccionPrincipal, cambiarSeccion],
  );

  const fijarHerenciaCampo = useCallback(
    (columna: string, modo: 'inherit' | 'clear') => cambiarDocumento((d) => fijarModoCampo(d, columna, modo)),
    [cambiarDocumento],
  );

  /** En una sede, el menú del principal no se edita desde aquí (cambiaría el principal). */
  const puedeEditarMenu = useCallback(
    (zona: ZonaGlobal | null): boolean => {
      if (!enV2) return true;
      if (zona === 'footer') return !esSedeV2;
      const id = settingsVista?.header_menu_id ?? null;
      if (!id) return !esSedeV2;
      if (!esSedeV2) return true;
      return !(basePrincipal?.documento.menus ?? []).some((m) => m.id === id) || !UUID_MENU.test(id);
    },
    [enV2, esSedeV2, settingsVista, basePrincipal],
  );

  /**
   * Respuesta a «¿Cambiar solo en <Sede> o en todas las sedes?».
   * - `sede`: la sección pasa a ser de esta sede («Solo en esta sede») y el cambio se aplica aquí.
   * - `todas`: se pasa a editar el sitio principal con la misma sección y el cambio se aplica
   *   allí; al publicar el principal, las sedes que la heredan la reciben (siteDocumentService).
   */
  const responderPreguntaSede = useCallback(
    async (destino: 'sede' | 'todas') => {
      const pregunta = preguntaSede;
      setPreguntaSede(null);
      if (!pregunta) return;
      if (destino === 'sede') {
        if (pregunta.operacion.tipo === 'eliminar') {
          await ejecutarEliminar(pregunta.seccionId);
          return;
        }
        personalizarSeccion(pregunta.seccionId);
        aplicarCambioSeccion(pregunta.seccionId, pregunta.operacion.cambio);
        return;
      }
      const pagina = currentPageRef.current;
      if (!pagina) return;
      cambioParaPrincipalRef.current = { paginaId: pagina.id, seccionId: pregunta.seccionId, operacion: pregunta.operacion };
      await elegirSitioV2(null);
      toast(t('sede.ahoraPrincipal'), { description: t('sede.ahoraPrincipalDescripcion') });
    },
    [preguntaSede, personalizarSeccion, aplicarCambioSeccion, ejecutarEliminar, elegirSitioV2, t],
  );

  // «En todas»: cuando el sitio principal está abierto en la misma página, se aplica el cambio retenido.
  useEffect(() => {
    const pendiente = cambioParaPrincipalRef.current;
    if (!pendiente || sitioBranch !== null || !currentPage || estadoCarga !== 'listo') return;
    if (!enV2) {
      // Principal sin borrador V2: se edita a mano en el sitio principal (ya abierto).
      if (!v2.cargando) cambioParaPrincipalRef.current = null;
      return;
    }
    if (sitioCargado !== null) return;
    if (currentPage.id !== pendiente.paginaId) {
      void cambiarPagina(pendiente.paginaId);
      return;
    }
    cambioParaPrincipalRef.current = null;
    if (!currentPage.sections.some((s) => s.id === pendiente.seccionId)) return;
    setZonaGlobal(null);
    if (pendiente.operacion.tipo === 'eliminar') {
      void ejecutarEliminar(pendiente.seccionId);
      return;
    }
    setActiveSectionId(pendiente.seccionId);
    aplicarCambioSeccion(pendiente.seccionId, pendiente.operacion.cambio);
  }, [sitioBranch, sitioCargado, enV2, v2.cargando, currentPage, estadoCarga, cambiarPagina, aplicarCambioSeccion, ejecutarEliminar]);

  // ── Lienzo ─────────────────────────────────────────────────────────────────
  const esDetalle = currentPage ? !!RUTA_DETALLE[currentPage.page_type] : false;
  /**
   * Base pública del sitio que pinta el lienzo sin borrador firmado (legacy, plantillas de
   * detalle, o sin firma): la de la sede que el sitio sirve aparte (`/<slug>` o dominio propio)
   * o la del principal. `undefined` mientras faltan los datos de la sede elegida: el lienzo espera
   * en vez de cargar un instante el sitio del principal.
   */
  const baseLienzo = useMemo(
    () => baseLienzoSitio(previewUrlBase, sedeConteo, sucursalesWeb),
    [previewUrlBase, sedeConteo, sucursalesWeb],
  );

  /**
   * Lienzo sobre el BORRADOR (V2, principal y sedes): la misma vista previa firmada que el botón
   * «Vista previa» (`POST …/vista-previa`, HMAC de 24 h, solo con `website.sites.edit`). Una
   * página que solo existe en el borrador ya no sale «404». La firma es por sitio, se pide una vez
   * y se renueva antes de caducar. Sin firma (503 o error): la dirección pública, como antes.
   */
  const sitioLienzoId =
    enV2 && v2.borrador && sitioCargado === sitioBranch && v2.borrador.sitio.branchId === sitioBranch
      ? v2.borrador.sitio.id
      : null;
  const [firmaLienzo, setFirmaLienzo] = useState<{ sitioId: string; token: string | null; caducaEn: number } | null>(null);
  const [relojFirma, setRelojFirma] = useState(0);
  useEffect(() => {
    if (!sitioLienzoId || !pedirFirmaLienzo(sitioLienzoId, firmaLienzo, Date.now())) return;
    const id = sitioLienzoId;
    let vigente = true;
    clienteSitiosV2
      .vistaPrevia(id, null)
      .then(({ token, caducaEn }) => {
        if (!vigente) return;
        const caduca = Date.parse(caducaEn);
        setFirmaLienzo({ sitioId: id, token, caducaEn: Number.isFinite(caduca) ? caduca : Date.now() + 60 * 60 * 1000 });
      })
      .catch(() => {
        if (vigente) setFirmaLienzo({ sitioId: id, token: null, caducaEn: 0 });
      });
    return () => {
      vigente = false;
    };
  }, [sitioLienzoId, firmaLienzo, relojFirma]);
  useEffect(() => {
    if (!firmaLienzo?.token) return;
    const espera = Math.max(0, firmaLienzo.caducaEn - Date.now() - MARGEN_RENOVAR_FIRMA_MS);
    const temporizador = setTimeout(() => setRelojFirma((n) => n + 1), Math.min(espera, 2_000_000_000));
    return () => clearTimeout(temporizador);
  }, [firmaLienzo]);
  const firmaDelSitio = sitioLienzoId && firmaLienzo?.sitioId === sitioLienzoId ? firmaLienzo : null;
  /** El lienzo pinta el borrador (no las plantillas de detalle: `/productos/<id>` no pasa por él). */
  const lienzoEnBorrador = !!sitioLienzoId && !esDetalle;

  const urlLienzo = useMemo(() => {
    if (!currentPage || !direccionLista) return null;
    if (lienzoEnBorrador) {
      if (!firmaDelSitio) return null; // firma en camino: `preparandoLienzo`
      if (firmaDelSitio.token && previewUrlBase) return urlLienzoBorrador(previewUrlBase, firmaDelSitio.token, currentPage.slug);
      // Sin firma: la dirección pública, como antes.
    }
    const base = baseLienzo;
    if (!base) return null;
    if (currentPage.slug === 'home') return base;
    if (esDetalle) return `${base}/${RUTA_DETALLE[currentPage.page_type]}${previewEntityId ? `/${previewEntityId}` : ''}`;
    return `${base}/${currentPage.slug}`;
  }, [direccionLista, lienzoEnBorrador, firmaDelSitio, previewUrlBase, baseLienzo, currentPage, esDetalle, previewEntityId]);
  /** Sin `urlLienzo` porque aún se espera la dirección, la sede o la firma: el lienzo muestra el esqueleto. */
  const preparandoLienzo =
    !!currentPage && !urlLienzo && (!direccionLista || (lienzoEnBorrador ? !firmaDelSitio : baseLienzo === undefined));

  // V2: además el tema del borrador (fuentes, redondeo, botón, movimiento), que el sitio pinta en vivo.
  const temaLienzo = useMemo(
    () => (enV2 ? temaParaLienzo(docLocal, esSedeV2, v2.borrador?.basePrincipal) : null),
    [enV2, docLocal, esSedeV2, v2.borrador],
  );
  const ajustesLienzo = useMemo(
    () =>
      settingsVista
        ? { ajustes: ajustesParaLienzo(settingsVista as unknown as Record<string, unknown>), menuEncabezado: null, tema: temaLienzo }
        : null,
    [settingsVista, temaLienzo],
  );

  /** Secciones que pinta el lienzo: las de la versión que se está viendo o las del borrador. */
  const seccionesLienzo = useMemo(() => {
    if (vistaVersion && currentPage && organizationId) {
      const p = vistaVersion.documento.paginas.find((x) => x.id === currentPage.id);
      return p ? paginaAVista(p, { organizationId, branchId: sitioBranch }).sections : [];
    }
    return currentPage?.sections ?? [];
  }, [vistaVersion, currentPage, organizationId, sitioBranch]);

  const sujetoDatos = esSedeV2 ? nombreSede(sitioBranch) : t('sede.tuOrganizacion');
  const avisoSeccion = useCallback(
    (s: WebsitePageSection) =>
      avisoFaltanDatos(s.section_type, getSectionDefinition(s.section_type)?.label ?? s.section_type, conteoFuentes, sujetoDatos),
    [conteoFuentes, sujetoDatos],
  );

  /** Enlace de la vista previa: firmado (V2, el borrador) o la página con ?preview=1 (legacy). */
  const pedirVistaPrevia = useCallback(async (): Promise<string | null> => {
    if (!enV2 || !v2.sitio) {
      if (!urlLienzo) return null;
      try {
        const u = new URL(urlLienzo);
        u.searchParams.set('preview', '1');
        return u.toString();
      } catch {
        return urlLienzo;
      }
    }
    if (!previewUrlBase) return null;
    if (!(await guardarAhora())) return null;
    const pagina = currentPageRef.current;
    const { token } = await clienteSitiosV2.vistaPrevia(v2.sitio.id, pagina?.id ?? null);
    const ruta = pagina && pagina.slug !== 'home' && !esDetalle ? `/${pagina.slug}` : '';
    return `${previewUrlBase.replace(/\/$/, '')}/vista-previa/${token}${ruta}`;
  }, [enV2, v2.sitio, urlLienzo, previewUrlBase, guardarAhora, esDetalle]);

  const cambiosSinPublicar = enV2 ? !!v2.sitio?.cambiosSinPublicar || hasChanges : false;
  /** Cambios desde la última publicación (A/05g): `null` mientras no se conoce lo publicado. */
  const listaCambios: CambioPublicacion[] | null = useMemo(() => {
    if (!enV2 || !docLocal) return null;
    if (v2.sitio?.revisionPublicadaId && !documentoPublicado) return null;
    const actual = currentPage ? aplicarPaginaAlDocumento(docLocal, currentPage) : docLocal;
    return listarCambios(actual, documentoPublicado);
  }, [enV2, docLocal, currentPage, documentoPublicado, v2.sitio]);

  return {
    // carga
    estadoCarga,
    recargar: () => {
      void resumen.recargar();
      void cargar();
    },
    organizationId,
    permisos,
    host: resumen.datos?.sitio.host ?? null,
    urlPublica,
    giroTypeId: resumen.datos?.typeId ?? null,
    /** Giro del sitio (asistente u `organizations.type_id`): recomienda secciones sin tipo de sede. */
    giro: resumen.datos?.giro ?? null,
    hayPublicacion: enV2 ? !!v2.sitio?.revisionPublicadaId : true,
    // páginas
    pages,
    currentPage,
    cambiarPagina,
    previewEntities,
    previewEntityId,
    setPreviewEntityId,
    sectionManifest,
    // modo
    enV2,
    esSedeV2,
    apiV2,
    sitioV2: v2,
    sitios,
    documento: docLocal,
    documentoActual,
    settings: settingsVista,
    availableMenus: enV2 && docLocal ? docLocal.menus.map((m) => ({ id: m.id, name: m.nombre })) : availableMenus.map((m) => ({ id: m.id, name: m.name })),
    pendingMenuUpdates,
    // estado
    hasChanges,
    isSaving,
    estadoGuardado,
    cambiosSinPublicar,
    listaCambios,
    documentoPublicado,
    ultimaPublicacion,
    /** Un cambio que el editor no ve (árbol de páginas del menú legacy): solo marca pendiente. */
    marcarCambio,
    publicando,
    programacion,
    programarDisponible,
    // selección
    activeSectionId,
    seleccionarSeccion,
    zonaGlobal,
    seleccionarZona,
    dispositivo,
    setDispositivo,
    // historia
    deshacer: () => {
      undo();
      marcarCambio();
    },
    rehacer: () => {
      redo();
      marcarCambio();
    },
    canUndo,
    canRedo,
    // secciones
    cambiarContenido,
    cambiarVariante,
    alternarVisible,
    cambiarVisibilidad,
    cambiarEstilo,
    anadirSeccion,
    eliminarSeccion,
    duplicarSeccion,
    moverSeccion,
    materializarPorDefecto,
    indiceInsercion,
    conteoFuentes,
    recargarConteoFuentes,
    avisoSeccion,
    // página
    cambiarSeoPagina,
    cambiarDisenoPagina,
    // global
    cambiarAjustes,
    cambiarDocumento,
    cambiarItemsMenu,
    puedeEditarMenu,
    // guardar / publicar
    guardarAhora,
    guardarLegacy,
    publicar,
    programar,
    cancelarProgramacion,
    // historial
    verVersion,
    vistaVersion,
    cerrarVistaVersion: () => setVistaVersion(null),
    restaurar,
    // conflicto
    conflicto,
    prepararCombinacion,
    resolverConflicto,
    // sedes
    sedes,
    sitioBranch,
    selectedBranchId,
    publishedBranches,
    nombreSitio,
    nombreSede,
    tipoDeSede,
    trasAplicarPlantilla,
    elegirSitioV2,
    crearSitioSede,
    cambiarSedeLegacy,
    salirDeV2,
    cambiarAdopcion,
    llevarMenu,
    basePrincipal,
    origenes,
    personalizados: contarPersonalizados(origenes),
    ambitoSeccion,
    personalizarSeccion,
    preguntaSede: preguntaSede
      ? { seccionId: preguntaSede.seccionId, accion: preguntaSede.operacion.tipo === 'eliminar' ? ('quitar' as const) : ('cambiar' as const) }
      : null,
    responderPreguntaSede,
    cancelarPreguntaSede: () => setPreguntaSede(null),
    restablecerSeccionSede,
    origenEstilo,
    restablecerGrupo,
    fijarHerenciaCampo,
    // lienzo
    urlLienzo,
    preparandoLienzo,
    previewRefreshKey,
    ajustesLienzo,
    seccionesLienzo,
    pedirVistaPrevia,
  };
}

export type EditorSitio = ReturnType<typeof useEditorSitio>;
