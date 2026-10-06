'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  websitePageBuilderService,
  type WebsitePage,
  type WebsitePageSection,
  type WebsitePageWithSections,
} from '@/lib/services/websitePageBuilderService';
import {
  websiteSettingsService,
  type WebsiteSettings,
} from '@/lib/services/websiteSettingsService';
import {
  EditorHeader,
  EditorSidebar,
  EditorPreview,
  AddSectionDialog,
  GlobalSettingsPanel,
  PageSEOPanel,
  PageLayoutPanel,
  HeaderInspector,
  FooterInspector,
  HojaMenu,
  esZonaGlobal,
  type ZonaGlobal,
  type OutletOption,
  type DevicePreview,
} from '@/components/organization/branding/editor';
import { useHistory } from '@/components/organization/branding/editor/useHistory';
import { extractStyle, applyStyle } from '@/components/organization/branding/editor/styleUtils';
import { websiteMenuGroupService, type MenuGroup } from '@/lib/services/websiteMenuGroupService';
import type { SectionManifest } from '@/lib/services/website/sectionContract';
import { getDefaultSectionsForPageType } from '@/lib/services/website/defaultProductDetailSections';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { avisoFaltanDatos } from '@/lib/services/website/fuentesDatosSecciones';
import { useConteoFuentes } from '@/lib/website/useConteoFuentes';
import { CLAVES_ENCABEZADO, CLAVES_PIE, ajustesParaLienzo } from '@/lib/website/ajustesVivos';
import type { AmbitoSeccionSede } from '@/components/organization/branding/editor/EditorSidebar';
import type { AjustesVivosLienzo, DetalleClicLienzo, ItemMenuVivo } from '@/components/organization/branding/editor/EditorPreview';
import ConstructorCarta from '@/components/organization/branding/editor/carta/ConstructorCarta';
import type { CambioProducto } from '@/lib/services/website/cartaSede';

/**
 * Activar V2 bloquea el guardado legacy del sitio. Hasta que goadmin-websites lea la
 * revisión publicada, activarlo dejaría la web congelada: se habilita con
 * NEXT_PUBLIC_WEBSITE_V2_LECTOR=1 cuando ese lector esté desplegado.
 */
const LECTOR_PUBLICO_V2_LISTO = process.env.NEXT_PUBLIC_WEBSITE_V2_LECTOR === '1';
import { branchService } from '@/lib/services/branchService';
import type { Branch } from '@/types/branch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  SelectorSitio,
  DialogoPublicar,
  PanelHistorial,
  DialogoConflicto,
  AccionesSitioV2,
  BandaSitioV2,
  PanelHerencia,
  type EstadoGuardadoV2,
  type SucursalSelector,
} from '@/components/organization/branding/editor/v2';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import type { BasePrincipal, RevisionResumen, SitioResumen } from '@/lib/website/v2/tipos';
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
} from '@/lib/website/v2/vistaEditor';

/** Campos de la página que el editor guarda con `updatePage`. */
type PageUpdates = Parameters<typeof websitePageBuilderService.updatePage>[1];
/**
 * Mensaje de un error capturado, si lo trae. Los errores de Supabase
 * (`PostgrestError`) son objetos con `message`, no instancias de `Error`.
 */
const mensajeError = (error: unknown): string | undefined => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return undefined;
};

const UUID_MENU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sitio V2 que se edita (ADR-002 D1/D4). `null` en el estado del editor = modo legacy: el editor
 * y su guardado son exactamente los de siempre. Solo se entra en V2 para un sitio que ya tiene
 * borrador (creado por una acción explícita del usuario).
 */
interface EditorV2 {
  sitio: SitioResumen;
  version: number;
  actualizadoEn: string;
  basePrincipal: BasePrincipal | null;
  erroresContrato: number;
}

export default function PageEditorPage() {
  const params = useParams();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const pageId = (params?.pageId as string) ?? '';

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [currentPage, setCurrentPage] = useState<WebsitePageWithSections | null>(null);
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sectionManifest, setSectionManifest] = useState<SectionManifest | null>(null);

  // Editor state
  const [devicePreview, setDevicePreview] = useState<DevicePreview>('desktop');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showPageSEO, setShowPageSEO] = useState(false);
  // Encabezado / pie seleccionados (inspector derecho) y hoja del menú
  const [zonaGlobal, setZonaGlobal] = useState<ZonaGlobal | null>(null);
  const [hojaMenuAbierta, setHojaMenuAbierta] = useState(false);
  const [showPageLayout, setShowPageLayout] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  // Diálogos de confirmación (reemplazan window.confirm)
  const [pendingPageChange, setPendingPageChange] = useState<string | null>(null);
  const [pendingDeleteSection, setPendingDeleteSection] = useState<string | null>(null);
  const [availableMenus, setAvailableMenus] = useState<MenuGroup[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  // F9.4 — Selector de contexto para plantillas de detalle
  const [previewEntityId, setPreviewEntityId] = useState<string | null>(null);
  const [previewEntities, setPreviewEntities] = useState<Array<{ id: string; label: string }>>([]);

  // Fase 4 — Editor multi-outlet
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [outletOptions, setOutletOptions] = useState<OutletOption[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [publishedBranches, setPublishedBranches] = useState<Branch[]>([]);
  const [pendingOutletChange, setPendingOutletChange] = useState<number | null | undefined>(undefined);
  // F4 R2 — Track si el outlet tiene fila propia en website_settings
  const [outletSettingsExists, setOutletSettingsExists] = useState<boolean>(true);

  // F12.3 — Undo/Redo sobre el estado de secciones (límite 50 pasos)
  const {
    state: sectionsState,
    set: setSectionsState,
    undo: undoSections,
    redo: redoSections,
    reset: resetSections,
    canUndo,
    canRedo,
  } = useHistory<WebsitePageSection[]>([]);

  // F12.4 — Portapapeles interno de estilo (copiar/pegar estilo entre secciones)
  const styleClipboard = useRef<ReturnType<typeof extractStyle> | null>(null);

  // F12.4 — Filtro de búsqueda de secciones en el sidebar
  const [sectionSearch, setSectionSearch] = useState('');

  // Pending changes (batched for save)
  const pendingSectionUpdates = useRef<Map<string, Partial<WebsitePageSection>>>(new Map());
  const pendingSettingsUpdates = useRef<Partial<WebsiteSettings>>({});
  const pendingPageUpdates = useRef<PageUpdates>({});
  // F9.3 — Cambios pendientes de page_settings (layout de página)
  const pendingPageSettings = useRef<Record<string, unknown> | null>(null);
  // Cambios pendientes del MenuTreeEditor (header_order, menu_icon, etc.)
  const pendingMenuUpdates = useRef<Map<string, Record<string, unknown>>>(new Map());

  // ---- Sitios V2: borrador → Publicar → historial, y sedes con herencia ----
  const [sitiosV2, setSitiosV2] = useState<SitioResumen[]>([]);
  const [sucursalesV2, setSucursalesV2] = useState<SucursalSelector[]>([]);
  const [apiV2Disponible, setApiV2Disponible] = useState(false);
  const [cargandoV2, setCargandoV2] = useState(false);
  const [editorV2, setEditorV2] = useState<EditorV2 | null>(null);
  const [docV2, setDocV2] = useState<DocumentoSitio | null>(null);
  const [ajustesLegacyPrincipal, setAjustesLegacyPrincipal] = useState<WebsiteSettings | null>(null);
  const [estadoGuardadoV2, setEstadoGuardadoV2] = useState<EstadoGuardadoV2>('guardado');
  const [sitioPorCrear, setSitioPorCrear] = useState<number | null | undefined>(undefined);
  const [creandoSitio, setCreandoSitio] = useState(false);
  const [mostrarPublicar, setMostrarPublicar] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [mostrarHerencia, setMostrarHerencia] = useState(false);
  const [conflictoV2, setConflictoV2] = useState<{ versionServidor: number | null } | null>(null);
  const [adopcionPendiente, setAdopcionPendiente] = useState<boolean | null>(null);
  const [cambiandoAdopcion, setCambiandoAdopcion] = useState(false);
  /** El usuario eligió «Editar el sitio actual (sin V2)» en un sitio principal no adoptado. */
  const forzarLegacy = useRef(false);
  /** Secciones heredadas que el usuario desbloqueó con «Personalizar en esta sede». */
  const [seccionesPersonalizadas, setSeccionesPersonalizadas] = useState<Set<string>>(new Set());
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const inicializarV2Ref = useRef<(paginaId: string, branchDePagina: number | null) => Promise<void>>(async () => {});
  const enV2 = editorV2 !== null && docV2 !== null;
  const esSedeV2 = enV2 && editorV2.sitio.branchId !== null;

  // «Faltan datos»: registros reales del ERP por fuente (solo conteos). Se recargan al abrir
  // «Añadir sección» por si el usuario creó los datos en otra pestaña.
  const sedeConteo = enV2 ? editorV2.sitio.branchId : selectedBranchId;
  const { conteos: conteoFuentes, recargar: recargarConteoFuentes } = useConteoFuentes(Boolean(organizationId), sedeConteo);

  // Encabezado, pie, tema y menú en edición: el lienzo los aplica sin guardar (`goadmin:settings`).
  const [menuVivo] = useState<ItemMenuVivo[] | null>(null);
  // Constructor de la carta (`menu_full`): sección abierta y plato que llega del lienzo.
  const [cartaAbierta, setCartaAbierta] = useState<{ sectionId: string; plato: number | null } | null>(null);
  const [cambiosCartaSede, setCambiosCartaSede] = useState<{ branchId: number; cambios: CambioProducto[] } | null>(null);
  const ajustesVivos = useMemo<AjustesVivosLienzo | null>(
    () =>
      settings
        ? { ajustes: ajustesParaLienzo(settings as unknown as Record<string, unknown>), menuEncabezado: menuVivo }
        : null,
    [settings, menuVivo],
  );

  // ---- LOAD DATA ----
  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      setIsLoading(true);

      // Fase 4 §2.2 — Cargar la página actual PRIMERO para resolver el outlet
      const pageData = await websitePageBuilderService.getPageWithSections(pageId);
      setCurrentPage(pageData);

      // Resolver el outlet desde la página (no asumir Global)
      const initialBranchId = (pageData as WebsitePage | null)?.branch_id ?? null;
      setSelectedBranchId(initialBranchId);

      // Ahora cargar pages y settings con el branchId resuelto
      const [pagesData, settingsDataRaw, preview] = await Promise.all([
        websitePageBuilderService.getPages(organizationId, initialBranchId),
        websiteSettingsService.getSettings(organizationId, initialBranchId),
        websitePageBuilderService.getPreviewUrl(organizationId),
      ]);

      // F4 R2 — Si el outlet no tiene settings propios, cargar globales como base
      let settingsData = settingsDataRaw;
      let outletHasSettings = true;
      if (!settingsData && initialBranchId !== null) {
        settingsData = await websiteSettingsService.getSettings(organizationId, null);
        outletHasSettings = false;
      }
      setOutletSettingsExists(outletHasSettings);

      setPages(pagesData);
      setSettings(settingsData);
      setPreviewUrl(preview);

      // Fase 4 §2.3 — Cargar outlets publicables (branches con is_web_published=true Y branch_type válido)
      try {
        const allBranches = await branchService.getBranches(organizationId);
        setSucursalesV2(
          allBranches
            .filter((b) => typeof b.id === 'number')
            .map((b) => ({ id: b.id as number, nombre: b.name, activa: b.is_active !== false })),
        );
        const validPublished = allBranches.filter(
          (b) => b.is_web_published === true && !!b.branch_type,
        );
        setPublishedBranches(validPublished);

        // Avisar de outlets publicados pero incompletos (sin branch_type)
        const invalid = allBranches.filter(
          (b) => b.is_web_published === true && !b.branch_type,
        );
        if (invalid.length > 0) {
          toast({
            title: 'Outlet(s) incompleto(s)',
            description: `${invalid.map((b) => b.name).join(', ')} está publicado pero no tiene branch_type. Corrígelo en Sucursales antes de editar su branding.`,
            variant: 'destructive',
          });
        }

        const options: OutletOption[] = [
          { value: null, label: 'Global (organización)', branchType: null },
          ...validPublished.map((b) => ({
            value: b.id!,
            label: b.name,
            branchType: b.branch_type ?? null,
          })),
        ];
        setOutletOptions(options);

        // Resolver la branch seleccionada
        const resolved = validPublished.find((b) => b.id === initialBranchId) ?? null;
        setSelectedBranch(resolved);
      } catch {
        // Si falla, fallback a Global
        setOutletOptions([{ value: null, label: 'Global (organización)', branchType: null }]);
      }

      // Cargar menús nombrados para selectores
      if (organizationId) {
        try {
          const menus = await websiteMenuGroupService.getMenus(organizationId);
          setAvailableMenus(menus);
        } catch {
          // Los menús pueden no existir aún, es seguro ignorar
        }
      }

      // Sitios V2: solo cambia el editor si el sitio ya tiene borrador V2.
      await inicializarV2Ref.current(pageId, initialBranchId);
    } catch (error) {
      console.error('Error loading editor data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del editor',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, pageId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // «Publicar» desde la barra de la vista previa del borrador llega con `?accion=publicar`:
  // se abre el diálogo de publicar (con su confirmación) en cuanto el borrador está cargado.
  const accionPendiente = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    accionPendiente.current = params.get('accion');
  }, []);
  useEffect(() => {
    if (!enV2 || accionPendiente.current !== 'publicar') return;
    accionPendiente.current = null;
    setMostrarPublicar(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('accion');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [enV2]);

  // F9.4 — Cargar entidades para el selector de contexto de plantillas de detalle
  const currentPageType = currentPage?.page_type;
  useEffect(() => {
    if (!organizationId || !currentPageType) return;
    const pageType = currentPageType;
    if (!['product_detail', 'category_detail', 'space_detail'].includes(pageType)) {
      setPreviewEntities([]);
      setPreviewEntityId(null);
      return;
    }
    let cancelled = false;
    websitePageBuilderService
      .getPreviewEntities(organizationId, pageType)
      .then((entities) => {
        if (cancelled) return;
        setPreviewEntities(entities);
        // Auto-seleccionar la primera entidad si no hay una seleccionada
        if (entities.length > 0) {
          setPreviewEntityId((actual) => actual ?? entities[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewEntities([]);
      });
    return () => { cancelled = true; };
  }, [organizationId, currentPageType]);

  // F12.3 — Sincronizar la pila de undo/redo cuando se carga una página nueva.
  useEffect(() => {
    if (currentPage?.sections) {
      resetSections(currentPage.sections);
    }
    // Solo al cambiar de página: reiniciar el historial con cada edición lo vaciaría.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage?.id, resetSections]);

  // F12.3 — Cuando undo/redo cambia sectionsState, reflejarlo en currentPage.
  useEffect(() => {
    setCurrentPage((prev) => {
      if (!prev) return prev;
      // Evitar loop: solo actualizar si difiere
      if (JSON.stringify(prev.sections) === JSON.stringify(sectionsState)) return prev;
      return { ...prev, sections: sectionsState };
    });
  }, [sectionsState]);

  // F0.6 — Cargar manifiesto del sitio para detectar secciones desincronizadas.
  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    fetch(`${previewUrl}/api/_sections/manifest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SectionManifest | null) => {
        if (!cancelled) setSectionManifest(data);
      })
      .catch(() => {
        // El manifiesto puede no estar disponible (sitio offline, versión vieja).
        // No es crítico: el editor sigue funcionando sin badges de desync.
        if (!cancelled) setSectionManifest(null);
      });
    return () => { cancelled = true; };
  }, [previewUrl]);

  // F12.3 — Atajos de teclado del editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z — Undo
      if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canUndo) undoSections();
        return;
      }
      // Ctrl+Shift+Z — Redo
      if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canRedo) redoSections();
        return;
      }
      // Ctrl+Y — Redo (alternativa)
      if (isCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) redoSections();
        return;
      }
      // Ctrl+S — Guardar
      if (isCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasChanges && !isSaving) handleSave();
        return;
      }
      // Ctrl+D — Duplicar sección activa
      if (isCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (activeSectionId) handleDuplicateSection(activeSectionId);
        return;
      }
      // Esc — Deseleccionar
      if (e.key === 'Escape' && !isCtrl) {
        // Solo si el foco no está en un input/textarea
        const tag = (e.target as HTMLElement)?.tagName;
        // Con la hoja del menú abierta, Esc solo la cierra (Radix).
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !hojaMenuAbierta) {
          setActiveSectionId(null);
          setZonaGlobal(null);
        }
        return;
      }
      // Delete — Eliminar sección activa (solo si no estamos en un input)
      if (e.key === 'Delete' && !isCtrl && activeSectionId) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          handleDeleteSection(activeSectionId);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUndo, canRedo, undoSections, redoSections, hasChanges, isSaving, activeSectionId, hojaMenuAbierta]);

  // ---- SELECCIÓN: sección de la página o zona global (encabezado / pie) ----
  // Son excluyentes: una sección se edita en el sidebar; el encabezado y el
  // pie, en el inspector derecho.
  const seleccionarSeccion = (sectionId: string | null) => {
    setActiveSectionId(sectionId);
    if (sectionId) {
      setZonaGlobal(null);
      setHojaMenuAbierta(false);
    }
  };

  const seleccionarZonaGlobal = (zona: ZonaGlobal) => {
    setZonaGlobal(zona);
    setActiveSectionId(null);
  };

  // Clic en el lienzo. En una zona global ya seleccionada, el clic en un
  // enlace abre su menú (chip «clic en un enlace para editar el menú»).
  const handleSelectFromCanvas = (id: string, detalle: DetalleClicLienzo) => {
    if (esZonaGlobal(id)) {
      if (detalle.enlace && zonaGlobal === id) abrirHojaMenu(id);
      seleccionarZonaGlobal(id);
      return;
    }
    seleccionarSeccion(id);
    // Un plato de la carta tocado en el lienzo abre el constructor con ese plato elegido.
    const seccion = currentPage?.sections.find((s) => s.id === id);
    // En una sede, una carta heredada se abre solo tras «Personalizar en esta sede».
    if (seccion?.section_type === 'menu_full' && detalle.productoId && !(esSedeV2 && ambitoSeccionSede(id) === 'heredada')) {
      setCartaAbierta({ sectionId: id, plato: detalle.productoId });
    }
  };

  // Al cerrar la hoja: los menús nombrados se guardan al momento, así que se
  // recargan la lista de menús y el lienzo. El árbol de páginas queda
  // pendiente hasta «Guardar».
  const handleHojaMenuChange = async (abierta: boolean) => {
    setHojaMenuAbierta(abierta);
    if (abierta || !organizationId) return;
    if (enV2) {
      // V2: la hoja editó la biblioteca de menús; el borrador conserva su copia hasta traerla.
      toast({
        title: 'Menú guardado en la biblioteca',
        description: 'Para llevar estos cambios al borrador usa «…» → «Actualizar menú en el borrador».',
      });
      return;
    }
    if (zonaGlobal === 'footer' || settings?.header_menu_id) {
      setPreviewRefreshKey((k) => k + 1);
      try {
        setAvailableMenus(await websiteMenuGroupService.getMenus(organizationId));
      } catch {
        // La lista se vuelve a cargar con el editor; no bloquea.
      }
    }
  };

  // ============================================================
  // SITIOS V2 — borrador, publicar, historial, sedes con herencia
  // ============================================================

  /** Ajustes que ve el editor para el documento (operación y columnas sin destino: fila legacy). */
  const vistaAjustesV2 = useCallback(
    (doc: DocumentoSitio, base: BasePrincipal | null, legacy: WebsiteSettings | null) =>
      ajustesDesdeDocumento(doc, legacy ?? ({} as WebsiteSettings), base?.documento ?? null),
    [],
  );

  const limpiarPendientes = () => {
    pendingSectionUpdates.current.clear();
    pendingSettingsUpdates.current = {};
    pendingPageUpdates.current = {};
    pendingPageSettings.current = null;
    pendingMenuUpdates.current.clear();
    setHasChanges(false);
  };

  /** Carga el borrador de un sitio y pone el editor en modo V2 sobre él. */
  const entrarV2 = async (sitio: SitioResumen, paginaPreferida?: string | null) => {
    if (!organizationId) return;
    setCargandoV2(true);
    try {
      const [borrador, legacy] = await Promise.all([
        clienteSitiosV2.borrador(sitio.id),
        ajustesLegacyPrincipal
          ? Promise.resolve(ajustesLegacyPrincipal)
          : websiteSettingsService.getSettings(organizationId, null),
      ]);
      setAjustesLegacyPrincipal(legacy);
      const ctx = { organizationId, branchId: sitio.branchId };
      const paginasVista = paginasDesdeDocumento(borrador.documento, ctx);
      const pagina =
        paginasVista.find((p) => p.id === paginaPreferida) ??
        paginasVista.find((p) => p.slug === 'home') ??
        paginasVista[0] ??
        null;

      limpiarPendientes();
      setSeccionesPersonalizadas(new Set());
      setDocV2(borrador.documento);
      setEditorV2({
        sitio: borrador.sitio,
        version: borrador.version,
        actualizadoEn: borrador.actualizadoEn,
        basePrincipal: borrador.basePrincipal,
        erroresContrato: borrador.erroresContrato.length,
      });
      setPages(paginasVista);
      setSettings(vistaAjustesV2(borrador.documento, borrador.basePrincipal, legacy).ajustes);
      setAvailableMenus(
        borrador.documento.menus.map((m) => ({ id: m.id, name: m.nombre }) as unknown as MenuGroup),
      );
      setSelectedBranchId(sitio.branchId);
      // Tipo de negocio de la sede para filtrar las secciones permitidas (como en legacy).
      setSelectedBranch(publishedBranches.find((b) => b.id === sitio.branchId) ?? null);
      setActiveSectionId(null);
      setZonaGlobal(null);
      setEstadoGuardadoV2(borrador.sitio.cambiosSinPublicar ? 'guardado' : 'publicado');
      setCurrentPage(pagina);
      if (pagina) {
        resetSections(pagina.sections);
        window.history.replaceState(null, '', `/organizacion/branding/editor/${pagina.id}`);
      }
      setPreviewRefreshKey((k) => k + 1);
    } catch (error) {
      toast({
        title: 'No se pudo abrir el borrador V2',
        description: error instanceof ErrorApiSitio ? error.message : 'Seguirás en el editor actual.',
        variant: 'destructive',
      });
    } finally {
      setCargandoV2(false);
    }
  };

  /** Vuelve al editor de siempre (legacy) recargando todo desde las tablas actuales. */
  const salirDeV2 = async () => {
    forzarLegacy.current = true;
    setEditorV2(null);
    setDocV2(null);
    limpiarPendientes();
    await loadData();
  };

  const recargarSitiosV2 = async (): Promise<SitioResumen[]> => {
    const lista = await clienteSitiosV2.listar();
    setSitiosV2(lista);
    return lista;
  };

  // Al cargar el editor: lista de sitios V2 y, si la página es del sitio principal y ese sitio
  // ya tiene borrador V2, se abre el borrador. Si la API falla, el editor sigue en legacy.
  inicializarV2Ref.current = async (paginaId: string, branchDePagina: number | null) => {
    try {
      const lista = await recargarSitiosV2();
      setApiV2Disponible(true);
      const principal = lista.find((s) => s.branchId === null);
      if (principal && branchDePagina === null && (!forzarLegacy.current || principal.v2Adoptado)) {
        await entrarV2(principal, paginaId);
      }
    } catch {
      setApiV2Disponible(false);
    }
  };

  /** Documento con la página abierta ya incorporada (las secciones se editan sobre la vista). */
  const documentoActualV2 = (): DocumentoSitio | null => {
    if (!docV2) return null;
    return currentPage ? aplicarPaginaAlDocumento(docV2, currentPage) : docV2;
  };

  /**
   * Guarda el borrador con compare-and-swap. Devuelve la versión nueva o `null` si no se guardó
   * (conflicto, documento inválido o error de red: los cambios siguen en el editor).
   */
  const guardarV2 = async (versionForzada?: number): Promise<number | null> => {
    if (!editorV2 || !organizationId) return null;
    const documento = documentoActualV2();
    if (!documento) return null;
    setIsSaving(true);
    setEstadoGuardadoV2('guardando');
    try {
      const resultado = await clienteSitiosV2.guardar(editorV2.sitio.id, documento, versionForzada ?? editorV2.version);
      setDocV2(documento);
      setEditorV2((prev) =>
        prev
          ? {
              ...prev,
              version: resultado.version,
              actualizadoEn: resultado.actualizadoEn,
              erroresContrato: 0,
              sitio: { ...prev.sitio, versionBorrador: resultado.version, cambiosSinPublicar: true },
            }
          : prev,
      );

      // Operación (envío, contador, botones…): no va al documento (D12). En el sitio principal
      // se sigue guardando en su fila legacy, como hoy; una sede todavía no tiene capa propia.
      const operacion = { ...pendingSettingsUpdates.current };
      if (Object.keys(operacion).length > 0) {
        if (editorV2.sitio.branchId === null) {
          await websiteSettingsService.updateSettings(organizationId, operacion, null);
        } else {
          toast({
            title: 'Ajustes de operación sin guardar en la sede',
            description: 'Envío, contador y botones de compra se configuran en el sitio principal por ahora.',
          });
        }
      }

      pendingSectionUpdates.current.clear();
      pendingSettingsUpdates.current = {};
      pendingPageUpdates.current = {};
      pendingPageSettings.current = null;
      pendingMenuUpdates.current.clear();
      setHasChanges(false);
      setEstadoGuardadoV2('guardado');
      setPreviewRefreshKey((k) => k + 1);
      void recargarSitiosV2().catch(() => undefined);
      return resultado.version;
    } catch (error) {
      if (error instanceof ErrorApiSitio && error.esConflicto) {
        const actual = (error.detalles as { actual?: number } | undefined)?.actual ?? null;
        setConflictoV2({ versionServidor: typeof actual === 'number' ? actual : null });
        setEstadoGuardadoV2('conflicto');
        return null;
      }
      setEstadoGuardadoV2('error');
      const detalle =
        error instanceof ErrorApiSitio && error.codigo === 'documento_invalido' && Array.isArray(error.detalles)
          ? ` (${(error.detalles as { ruta: string; codigo: string }[]).slice(0, 2).map((e) => `${e.ruta}: ${e.codigo}`).join('; ')})`
          : '';
      toast({
        title: 'No se guardó el borrador',
        description: `${error instanceof ErrorApiSitio ? error.message : 'Revisa tu conexión.'}${detalle} Tus cambios siguen en el editor.`,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const publicarV2 = async (nota: string | null) => {
    if (!editorV2) return;
    setPublicando(true);
    try {
      const version = hasChanges ? await guardarV2() : editorV2.version;
      if (version === null) return;
      const r = await clienteSitiosV2.publicar(editorV2.sitio.id, version, nota);
      const lista = await recargarSitiosV2().catch(() => sitiosV2);
      const sitio = lista.find((s) => s.id === editorV2.sitio.id);
      setEditorV2((prev) => (prev ? { ...prev, sitio: sitio ?? { ...prev.sitio, revisionPublicadaId: r.revisionId, cambiosSinPublicar: false } } : prev));
      setEstadoGuardadoV2('publicado');
      setMostrarPublicar(false);
      toast({
        title: r.idempotente ? 'Esta versión ya estaba publicada' : `Versión ${r.numero} publicada`,
        description: editorV2.sitio.v2Adoptado
          ? 'Tus clientes la verán en cuanto se actualice la caché.'
          : 'Queda guardada en el historial. La web sigue mostrando el sitio actual hasta que actives V2.',
      });
    } catch (error) {
      if (error instanceof ErrorApiSitio && error.esConflicto) {
        setMostrarPublicar(false);
        setConflictoV2({ versionServidor: (error.detalles as { actual?: number } | undefined)?.actual ?? null });
        setEstadoGuardadoV2('conflicto');
        return;
      }
      toast({
        title: 'No se pudo publicar',
        description: error instanceof ErrorApiSitio ? error.message : 'Revisa tu conexión e inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setPublicando(false);
    }
  };

  const restaurarV2 = async (revision: RevisionResumen) => {
    if (!editorV2) return;
    try {
      await clienteSitiosV2.restaurar(editorV2.sitio.id, revision.id, editorV2.version);
      await entrarV2(editorV2.sitio, currentPage?.id);
      toast({ title: `Versión ${revision.numero} restaurada en el borrador`, description: 'Revísala y publica cuando esté lista.' });
    } catch (error) {
      if (error instanceof ErrorApiSitio && error.esConflicto) {
        setConflictoV2({ versionServidor: (error.detalles as { actual?: number } | undefined)?.actual ?? null });
        setEstadoGuardadoV2('conflicto');
        return;
      }
      toast({
        title: 'No se pudo restaurar',
        description: error instanceof ErrorApiSitio ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const cambiarAdopcionV2 = async (adoptado: boolean) => {
    if (!editorV2) return;
    setCambiandoAdopcion(true);
    try {
      const sitio = await clienteSitiosV2.adopcion(editorV2.sitio.id, adoptado);
      setEditorV2((prev) => (prev ? { ...prev, sitio } : prev));
      await recargarSitiosV2().catch(() => undefined);
      toast({
        title: adoptado ? 'V2 activo en la web' : 'V2 desactivado',
        description: adoptado
          ? 'La web de este sitio pasa a servir la versión publicada.'
          : 'La web vuelve al sitio anterior. El borrador y las versiones se conservan.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo cambiar la activación de V2',
        description: error instanceof ErrorApiSitio ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setCambiandoAdopcion(false);
      setAdopcionPendiente(null);
    }
  };

  /** Copia un menú del principal a la sede (`fn_website_copiar_menu_a_sede`) o lo refresca en el borrador. */
  const llevarMenuV2 = async (menuId: string) => {
    if (!editorV2) return;
    if (hasChanges) {
      toast({ title: 'Guarda primero', description: 'Guarda el borrador antes de traer un menú.' });
      return;
    }
    try {
      const r = await clienteSitiosV2.llevarMenu(editorV2.sitio.id, menuId, editorV2.version);
      await entrarV2(editorV2.sitio, currentPage?.id);
      toast({
        title: r.copiado ? 'Menú copiado a esta sede' : 'Menú actualizado en el borrador',
        description: r.copiado ? 'Es una copia propia: los cambios del menú del principal ya no llegan aquí.' : undefined,
      });
    } catch (error) {
      if (error instanceof ErrorApiSitio && error.esConflicto) {
        setConflictoV2({ versionServidor: (error.detalles as { actual?: number } | undefined)?.actual ?? null });
        return;
      }
      toast({
        title: 'No se pudo traer el menú',
        description: error instanceof ErrorApiSitio ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  /** Selector «Editando: …». Una sede sin sitio pide confirmación antes de crearlo. */
  const elegirSitio = async (branchId: number | null) => {
    if (hasChanges) {
      toast({ title: 'Tienes cambios sin guardar', description: 'Guarda antes de cambiar de sitio.' });
      return;
    }
    const sitio = sitiosV2.find((s) => s.branchId === branchId);
    if (sitio) {
      forzarLegacy.current = false;
      await entrarV2(sitio, currentPage?.id);
      return;
    }
    // Sin sitio V2: se pide confirmación explícita antes de crearlo (nada cambia sin ella).
    setSitioPorCrear(branchId);
  };

  const crearSitioV2 = async () => {
    if (sitioPorCrear === undefined) return;
    setCreandoSitio(true);
    try {
      const r = await clienteSitiosV2.crear(sitioPorCrear);
      await recargarSitiosV2();
      forzarLegacy.current = false;
      setSitioPorCrear(undefined);
      await entrarV2(r.sitio, currentPage?.id);
      toast({
        title: sitioPorCrear === null ? 'Borrador V2 creado' : 'Sitio de la sede creado',
        description: 'Nada cambió en la web. Publica y activa V2 cuando esté listo.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo crear el sitio',
        description: error instanceof ErrorApiSitio ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setCreandoSitio(false);
    }
  };

  // Herencia de la sede: origen de cada campo y estado de cada sección frente al principal.
  const origenesV2 = useMemo(
    () => (docV2 && editorV2 ? vistaAjustesV2(docV2, editorV2.basePrincipal, ajustesLegacyPrincipal).origenes : {}),
    [docV2, editorV2, ajustesLegacyPrincipal, vistaAjustesV2],
  );
  const estadosSeccionV2 = useMemo(() => {
    if (!esSedeV2 || !docV2 || !editorV2?.basePrincipal) return {};
    const doc = currentPage ? aplicarPaginaAlDocumento(docV2, currentPage) : docV2;
    return estadoSecciones(doc, editorV2.basePrincipal.documento);
  }, [esSedeV2, docV2, editorV2, currentPage]);

  const fijarHerenciaCampo = (columna: string, modo: 'inherit' | 'clear') => {
    if (!docV2 || !editorV2) return;
    const doc = fijarModoCampo(docV2, columna, modo);
    setDocV2(doc);
    setSettings(vistaAjustesV2(doc, editorV2.basePrincipal, ajustesLegacyPrincipal).ajustes);
    setHasChanges(true);
    setEstadoGuardadoV2('cambios');
  };

  const restablecerSeccionV2 = (sectionId: string) => {
    if (!docV2 || !editorV2?.basePrincipal || !currentPage || !organizationId) return;
    const doc = restablecerSeccion(
      aplicarPaginaAlDocumento(docV2, currentPage),
      editorV2.basePrincipal.documento,
      currentPage.id,
      sectionId,
    );
    const pagina = doc.paginas.find((p) => p.id === currentPage.id);
    if (!pagina) return;
    const vista = paginaAVista(pagina, { organizationId, branchId: editorV2.sitio.branchId });
    setDocV2(doc);
    setCurrentPage(vista);
    setSectionsState(vista.sections);
    setSeccionesPersonalizadas((prev) => {
      const sig = new Set(prev);
      sig.delete(sectionId);
      return sig;
    });
    setHasChanges(true);
    setEstadoGuardadoV2('cambios');
  };

  /** «Personalizar en esta sede»: la sección heredada se puede editar; al cambiarla pasa a «Personalizada». */
  const personalizarSeccionV2 = (sectionId: string) => {
    setSeccionesPersonalizadas((prev) => new Set(prev).add(sectionId));
  };

  const ambitoSeccionSede = (sectionId: string): AmbitoSeccionSede | undefined => {
    const estado = estadosSeccionV2[sectionId];
    if (estado === 'nueva') return 'solo-esta-sede';
    if (estado === 'propia') return 'personalizada';
    if (estado === 'hereda') return seccionesPersonalizadas.has(sectionId) ? 'personalizada' : 'heredada';
    return undefined;
  };

  /**
   * En V2 la hoja del menú edita la biblioteca de menús (se guarda al momento, como siempre).
   * En una sede solo se permite sobre su copia propia: editar el menú del principal desde la sede
   * cambiaría el principal.
   */
  const puedeHojaMenuV2 = (zona: ZonaGlobal | null): boolean => {
    if (!enV2) return true;
    if (zona === 'footer') return !esSedeV2;
    const id = settings?.header_menu_id ?? null;
    if (!id || !UUID_MENU.test(id)) return false;
    if (!esSedeV2) return true;
    return !(editorV2?.basePrincipal?.documento.menus ?? []).some((m) => m.id === id);
  };

  const abrirHojaMenu = (zona: ZonaGlobal | null) => {
    if (puedeHojaMenuV2(zona)) {
      setHojaMenuAbierta(true);
      return;
    }
    toast({
      title: esSedeV2 ? 'Primero copia el menú a esta sede' : 'Este menú no se edita aquí',
      description: esSedeV2
        ? 'Usa «…» → «Copiar menú a esta sede». Así los cambios no tocan el menú del sitio principal.'
        : 'Asigna un menú nombrado al encabezado para editarlo.',
    });
  };

  // ---- PAGE CHANGE ----
  const handlePageChange = async (newPageId: string) => {
    if (enV2) {
      cambiarPaginaV2(newPageId);
      return;
    }
    if (hasChanges) {
      setPendingPageChange(newPageId);
      return;
    }
    await doPageChange(newPageId);
  };

  /** V2: la página abierta se incorpora al borrador en memoria; cambiar de página no pierde nada. */
  const cambiarPaginaV2 = (newPageId: string) => {
    if (!docV2 || !editorV2 || !organizationId) return;
    const doc = currentPage ? aplicarPaginaAlDocumento(docV2, currentPage) : docV2;
    const pagina = doc.paginas.find((p) => p.id === newPageId);
    if (!pagina) return;
    const vista = paginaAVista(pagina, { organizationId, branchId: editorV2.sitio.branchId });
    pendingSectionUpdates.current.clear();
    setDocV2(doc);
    setPages(paginasDesdeDocumento(doc, { organizationId, branchId: editorV2.sitio.branchId }));
    setCurrentPage(vista);
    resetSections(vista.sections);
    setActiveSectionId(null);
    setShowGlobalSettings(false);
    setPreviewRefreshKey((k) => k + 1);
    window.history.replaceState(null, '', `/organizacion/branding/editor/${newPageId}`);
  };

  const doPageChange = async (newPageId: string) => {
    // Reset pending changes
    pendingSectionUpdates.current.clear();
    pendingSettingsUpdates.current = {};
    setHasChanges(false);
    setActiveSectionId(null);
    setShowGlobalSettings(false);

    try {
      const pageData = await websitePageBuilderService.getPageWithSections(
        newPageId,
        organizationId,
        selectedBranchId,
      );
      setCurrentPage(pageData);
      setPreviewRefreshKey((k) => k + 1);
      // Update URL without re-mounting the component
      window.history.replaceState(null, '', `/organizacion/branding/editor/${newPageId}`);
    } catch (error) {
      console.error('Error switching page:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la página seleccionada',
        variant: 'destructive',
      });
    }
  };

  // ---- Fase 4 — CAMBIO DE OUTLET ----
  const handleOutletChange = async (branchId: number | null) => {
    if (hasChanges) {
      setPendingOutletChange(branchId);
      return;
    }
    await doOutletChange(branchId);
  };

  const doOutletChange = async (branchId: number | null) => {
    setSelectedBranchId(branchId);
    // Reset pending changes
    pendingSectionUpdates.current.clear();
    pendingSettingsUpdates.current = {};
    setHasChanges(false);
    setActiveSectionId(null);

    // Recargar páginas y settings del outlet
    try {
      setIsLoading(true);
      const [pagesData, settingsDataRaw] = await Promise.all([
        websitePageBuilderService.getPages(organizationId!, branchId),
        websiteSettingsService.getSettings(organizationId!, branchId),
      ]);

      // F4 R2 — Si el outlet no tiene settings propios, cargar globales como base
      let settingsData = settingsDataRaw;
      let outletHasSettings = true;
      if (!settingsData && branchId !== null) {
        settingsData = await websiteSettingsService.getSettings(organizationId!, null);
        outletHasSettings = false;
      }
      setOutletSettingsExists(outletHasSettings);

      setPages(pagesData);
      setSettings(settingsData);

      // Resolver branch_type para filtrado de secciones
      const branch = publishedBranches.find((b) => b.id === branchId) ?? null;
      setSelectedBranch(branch);

      // Si la página actual no pertenece al outlet seleccionado, cambiar a la primera
      if (currentPage && pagesData.length > 0) {
        const stillExists = pagesData.some((p) => p.id === currentPage.id);
        if (!stillExists) {
          await doPageChange(pagesData[0].id);
        }
      }
    } catch (error) {
      console.error('Error changing outlet:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del outlet',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ---- SECTION UPDATES (local state, batch for save) ----
  const handleUpdateSectionContent = (sectionId: string, content: Record<string, unknown>) => {
    if (!currentPage) return;

    const newSections = currentPage.sections.map((s) =>
      s.id === sectionId ? { ...s, content } : s
    );
    setCurrentPage((prev) => (prev ? { ...prev, sections: newSections } : prev));
    setSectionsState(newSections); // F12.3 — push a historial

    const existing = pendingSectionUpdates.current.get(sectionId) || {};
    pendingSectionUpdates.current.set(sectionId, { ...existing, content });
    setHasChanges(true);
  };

  const handleUpdateSectionVariant = (sectionId: string, variant: string) => {
    if (!currentPage) return;

    const newSections = currentPage.sections.map((s) =>
      s.id === sectionId ? { ...s, section_variant: variant } : s
    );
    setCurrentPage((prev) => (prev ? { ...prev, sections: newSections } : prev));
    setSectionsState(newSections);

    const existing = pendingSectionUpdates.current.get(sectionId) || {};
    pendingSectionUpdates.current.set(sectionId, {
      ...existing,
      section_variant: variant,
    });
    setHasChanges(true);
  };

  const handleToggleVisibility = (sectionId: string, visible: boolean) => {
    if (!currentPage) return;

    const newSections = currentPage.sections.map((s) =>
      s.id === sectionId ? { ...s, is_visible: visible } : s
    );
    setCurrentPage((prev) => (prev ? { ...prev, sections: newSections } : prev));
    setSectionsState(newSections);

    const existing = pendingSectionUpdates.current.get(sectionId) || {};
    pendingSectionUpdates.current.set(sectionId, {
      ...existing,
      is_visible: visible,
    });
    setHasChanges(true);
  };

  // ---- DELETE SECTION ----
  const handleDeleteSection = async (sectionId: string) => {
    if (!currentPage) return;
    setPendingDeleteSection(sectionId);
  };

  const doDeleteSection = async () => {
    const sectionId = pendingDeleteSection;
    if (!sectionId || !currentPage) return;
    if (enV2) {
      // V2: se quita del borrador; la sección publicada no se toca.
      const restantes = currentPage.sections.filter((s) => s.id !== sectionId);
      setCurrentPage((prev) => (prev ? { ...prev, sections: restantes } : prev));
      setSectionsState(restantes);
      pendingSectionUpdates.current.delete(sectionId);
      if (activeSectionId === sectionId) setActiveSectionId(null);
      setHasChanges(true);
      setEstadoGuardadoV2('cambios');
      return;
    }
    try {
      await websitePageBuilderService.deleteSection(sectionId);
      const newSections = currentPage.sections.filter((s) => s.id !== sectionId);
      setCurrentPage((prev) => (prev ? { ...prev, sections: newSections } : prev));
      setSectionsState(newSections);
      pendingSectionUpdates.current.delete(sectionId);
      if (activeSectionId === sectionId) setActiveSectionId(null);
      toast({ title: 'Sección eliminada' });
    } catch (error) {
      console.error('Error deleting section:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la sección',
        variant: 'destructive',
      });
    }
  };

  // ---- ADD SECTION ----
  /**
   * Posición de la sección nueva: después de la sección activa («Se añade después de
   * «X»») o al final si no hay ninguna activa.
   */
  const indiceInsercion = (): number => {
    if (!currentPage) return 0;
    const i = activeSectionId ? currentPage.sections.findIndex((s) => s.id === activeSectionId) : -1;
    return i >= 0 ? i + 1 : currentPage.sections.length;
  };

  const handleAddSection = async (sectionType: string, sectionVariant: string) => {
    if (!currentPage || !organizationId) return;
    const posicion = indiceInsercion();
    const alFinal = posicion === currentPage.sections.length;
    const etiqueta = getSectionDefinition(sectionType)?.label ?? sectionType;

    if (enV2) {
      const nueva: WebsitePageSection = {
        id: nuevoIdSeccion(),
        page_id: currentPage.id,
        organization_id: organizationId,
        section_type: sectionType,
        section_variant: sectionVariant,
        content: {},
        settings: {},
        sort_order: posicion,
        is_visible: true,
        created_at: '',
        updated_at: '',
        branch_id: editorV2?.sitio.branchId ?? null,
      };
      const conNueva = [...currentPage.sections];
      conNueva.splice(posicion, 0, nueva);
      const ordenadas = conNueva.map((s, i) => ({ ...s, sort_order: i }));
      setCurrentPage((prev) => (prev ? { ...prev, sections: ordenadas } : prev));
      setSectionsState(ordenadas);
      setActiveSectionId(nueva.id);
      setHasChanges(true);
      setEstadoGuardadoV2('cambios');
      toast({
        title: esSedeV2 ? `Sección agregada solo a ${nombreSitioV2}` : 'Sección agregada al borrador',
        description: etiqueta,
      });
      return;
    }

    try {
      const newSection = await websitePageBuilderService.addSection({
        page_id: currentPage.id,
        organization_id: organizationId,
        section_type: sectionType,
        section_variant: sectionVariant,
        sort_order: posicion,
      });

      setCurrentPage((prev) => {
        if (!prev) return prev;
        const newSections = [...prev.sections];
        newSections.splice(Math.min(posicion, newSections.length), 0, newSection);
        newSections.forEach((sec, i) => { sec.sort_order = i; });
        setSectionsState(newSections);
        return { ...prev, sections: newSections };
      });

      setActiveSectionId(newSection.id);
      // Insertada en medio: el nuevo orden se guarda con «Guardar» (como al duplicar).
      if (!alFinal) setHasChanges(true);
      toast({ title: 'Sección agregada', description: etiqueta });
    } catch (error) {
      console.error('Error adding section:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar la sección',
        variant: 'destructive',
      });
    }
  };

  // ---- REORDER SECTIONS ----
  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (!currentPage) return;

    const newSections = [...currentPage.sections];
    const [moved] = newSections.splice(fromIndex, 1);
    newSections.splice(toIndex, 0, moved);

    setCurrentPage((prev) => (prev ? { ...prev, sections: newSections } : prev));
    setSectionsState(newSections);
    setHasChanges(true);
  };

  // ---- F12.4: DUPLICATE SECTION ----
  const handleDuplicateSection = async (sectionId: string) => {
    if (!currentPage || !organizationId) return;
    if (enV2) {
      const idx = currentPage.sections.findIndex((s) => s.id === sectionId);
      if (idx < 0) return;
      const original = currentPage.sections[idx];
      const copia: WebsitePageSection = {
        ...original,
        id: nuevoIdSeccion(),
        content: JSON.parse(JSON.stringify(original.content ?? {})),
        settings: JSON.parse(JSON.stringify(original.settings ?? {})),
      };
      const conCopia = [...currentPage.sections];
      conCopia.splice(idx + 1, 0, copia);
      const ordenadas = conCopia.map((s, i) => ({ ...s, sort_order: i }));
      setCurrentPage((prev) => (prev ? { ...prev, sections: ordenadas } : prev));
      setSectionsState(ordenadas);
      setActiveSectionId(copia.id);
      setHasChanges(true);
      setEstadoGuardadoV2('cambios');
      toast({ title: 'Sección duplicada en el borrador' });
      return;
    }
    try {
      const newSection = await websitePageBuilderService.duplicateSection(sectionId);
      // Reordenar: insertar después de la original
      const idx = currentPage.sections.findIndex((s) => s.id === sectionId);
      const newSections = [...currentPage.sections];
      newSections.splice(idx + 1, 0, newSection);
      // Ajustar sort_order
      newSections.forEach((s, i) => { s.sort_order = i; });
      setCurrentPage((prev) => (prev ? { ...prev, sections: newSections } : prev));
      setSectionsState(newSections);
      setActiveSectionId(newSection.id);
      // F4 R3 (Issue 4) — Marcar hasChanges para que el reorden se persista al guardar
      setHasChanges(true);
      toast({ title: 'Sección duplicada' });
    } catch (error) {
      toast({ title: 'Error', description: mensajeError(error) || 'No se pudo duplicar', variant: 'destructive' });
    }
  };

  // ---- F12.4: COPY / PASTE STYLE ----
  const handleCopyStyle = (sectionId: string) => {
    const section = currentPage?.sections.find((s) => s.id === sectionId);
    if (!section) return;
    styleClipboard.current = extractStyle(section.content || {});
    toast({ title: 'Estilo copiado', description: 'Pégalo en otra sección con "Pegar estilo"' });
  };

  const handlePasteStyle = (sectionId: string) => {
    if (!currentPage || !styleClipboard.current) {
      toast({ title: 'Sin estilo copiado', description: 'Copia el estilo de una sección primero', variant: 'destructive' });
      return;
    }
    const section = currentPage.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const newContent = applyStyle(section.content || {}, styleClipboard.current);
    handleUpdateSectionContent(sectionId, newContent);
    toast({ title: 'Estilo aplicado' });
  };

  // ---- F12.4: APPLY STYLE TO ALL SECTIONS ----
  const handleApplyStyleToAll = (sourceSectionId: string) => {
    if (!currentPage) return;
    const source = currentPage.sections.find((s) => s.id === sourceSectionId);
    if (!source) return;
    const style = extractStyle(source.content || {});
    const newSections = currentPage.sections.map((s) => ({
      ...s,
      content: applyStyle(s.content || {}, style),
    }));
    setCurrentPage((prev) => (prev ? { ...prev, sections: newSections } : prev));
    setSectionsState(newSections);
    // Marcar todas como pendientes
    newSections.forEach((s) => {
      const existing = pendingSectionUpdates.current.get(s.id) || {};
      pendingSectionUpdates.current.set(s.id, { ...existing, content: s.content });
    });
    setHasChanges(true);
    toast({ title: 'Estilo aplicado a todas las secciones' });
  };

  // ---- F12.4: SAVE SECTION AS PRESET ----
  const handleSaveSectionAsPreset = async (sectionId: string, name: string) => {
    if (!currentPage || !organizationId) return;
    const section = currentPage.sections.find((s) => s.id === sectionId);
    if (!section) return;
    try {
      await websitePageBuilderService.saveSectionPreset(
        organizationId,
        name,
        section.section_type,
        section.section_variant,
        section.content || {},
      );
      toast({ title: 'Plantilla guardada', description: name });
    } catch (error) {
      toast({ title: 'Error', description: mensajeError(error) || 'No se pudo guardar la plantilla', variant: 'destructive' });
    }
  };

  // ---- F9.2 — MATERIALIZAR SECCIONES POR DEFECTO ----
  const handleMaterializeDefaultSections = async () => {
    if (!currentPage || !organizationId) return;
    const defaultSections = getDefaultSectionsForPageType(currentPage.page_type);
    if (defaultSections.length === 0) return;

    if (enV2) {
      if (currentPage.sections.length > 0) return;
      const nuevas: WebsitePageSection[] = defaultSections.map((d, i) => ({
        id: nuevoIdSeccion(),
        page_id: currentPage.id,
        organization_id: organizationId,
        section_type: d.section_type,
        section_variant: d.section_variant,
        content: {},
        settings: {},
        sort_order: i,
        is_visible: true,
        created_at: '',
        updated_at: '',
        branch_id: editorV2?.sitio.branchId ?? null,
      }));
      setCurrentPage((prev) => (prev ? { ...prev, sections: nuevas } : prev));
      setSectionsState(nuevas);
      setHasChanges(true);
      setEstadoGuardadoV2('cambios');
      toast({ title: 'Secciones agregadas al borrador', description: `${nuevas.length} secciones por defecto.` });
      return;
    }

    try {
      const created = await websitePageBuilderService.materializeDefaultSections(
        currentPage.id,
        organizationId,
        defaultSections,
      );
      if (created.length === 0) {
        toast({ title: 'La página ya tiene secciones', description: 'No se materializaron secciones por defecto.' });
        return;
      }
      // Recargar la página para reflejar las nuevas secciones
      const pageData = await websitePageBuilderService.getPageWithSections(
        currentPage.id,
        organizationId,
        selectedBranchId,
      );
      setCurrentPage(pageData);
      if (pageData?.sections) resetSections(pageData.sections);
      setPreviewRefreshKey((k) => k + 1);
      toast({ title: 'Secciones materializadas', description: `${created.length} secciones por defecto creadas.` });
    } catch (error) {
      console.error('Error materializing default sections:', error);
      toast({
        title: 'Error',
        description: mensajeError(error) || 'No se pudieron materializar las secciones por defecto.',
        variant: 'destructive',
      });
    }
  };

  // ---- PAGE SEO UPDATE ----
  const handleUpdatePageSEO = (updates: { meta_title?: string; meta_description?: string; og_image_url?: string }) => {
    if (!currentPage) return;
    setCurrentPage((prev) => (prev ? { ...prev, ...updates } : prev));
    pendingPageUpdates.current = { ...pendingPageUpdates.current, ...updates };
    setHasChanges(true);
  };

  // ---- F9.3 — PAGE LAYOUT SETTINGS UPDATE ----
  const handleUpdatePageSettings = (settings: Record<string, unknown>) => {
    if (!currentPage) return;
    setCurrentPage((prev) => (prev ? { ...prev, page_settings: settings } : prev));
    pendingPageSettings.current = settings;
    setHasChanges(true);
  };

  // ---- GLOBAL SETTINGS UPDATE ----
  const handleUpdateGlobalSettings = (updates: Partial<WebsiteSettings>) => {
    if (!settings) return;

    if (enV2 && docV2) {
      // V2: lo que tiene destino en el documento va al borrador; la operación (D12) queda
      // pendiente para la fila legacy del sitio principal.
      const delDocumento: Record<string, unknown> = {};
      const operacion: Record<string, unknown> = {};
      for (const [clave, valor] of Object.entries(updates)) {
        if (columnaVaAlDocumento(clave)) delDocumento[clave] = valor;
        else operacion[clave] = valor;
      }
      if (Object.keys(delDocumento).length > 0) {
        setDocV2(aplicarAjustesAlDocumento(docV2, delDocumento).documento);
      }
      pendingSettingsUpdates.current = { ...pendingSettingsUpdates.current, ...(operacion as Partial<WebsiteSettings>) };
      setSettings((prev) => (prev ? { ...prev, ...updates } : prev));
      setHasChanges(true);
      setEstadoGuardadoV2('cambios');
      return;
    }

    setSettings((prev) => (prev ? { ...prev, ...updates } : prev));
    pendingSettingsUpdates.current = {
      ...pendingSettingsUpdates.current,
      ...updates,
    };
    setHasChanges(true);
  };

  // ---- TOGGLE PAGE IN HEADER ----
  const handleTogglePageHeader = async (pageId: string, show: boolean) => {
    if (enV2) {
      toast({
        title: 'En V2 el encabezado usa los menús del borrador',
        description: 'Edita el menú del encabezado desde el inspector del encabezado.',
      });
      return;
    }
    try {
      await websitePageBuilderService.updatePage(pageId, { show_in_header: show });
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, show_in_header: show } : p))
      );
      setPreviewRefreshKey((k) => k + 1);
      toast({ title: show ? 'Página visible en header' : 'Página oculta del header' });
    } catch (error) {
      console.error('Error toggling page header:', error);
      toast({ title: 'Error', description: 'No se pudo actualizar la visibilidad', variant: 'destructive' });
    }
  };

  // ---- SAVE ALL CHANGES ----
  const handleSave = async () => {
    if (!organizationId || !currentPage) return;

    if (enV2) {
      await guardarV2();
      return;
    }

    // Un sitio principal con V2 activo en la web ya no se edita por el camino legacy (ETAPA-1 §3):
    // sus cambios no llegarían a la web. Solo aplica a sitios adoptados; el resto no cambia.
    if (selectedBranchId === null && sitiosV2.some((s) => s.branchId === null && s.v2Adoptado)) {
      toast({
        title: 'Este sitio usa V2',
        description: 'Edita su borrador V2 desde «Editando: Sitio principal» y publica para ver los cambios en la web.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // 1. Save section updates
      const sectionPromises: Promise<unknown>[] = [];
      pendingSectionUpdates.current.forEach((updates, sectionId) => {
        sectionPromises.push(
          websitePageBuilderService.updateSection(sectionId, updates)
        );
      });
      await Promise.all(sectionPromises);

      // 2. Save reorder
      const sectionIds = currentPage.sections.map((s) => s.id);
      await websitePageBuilderService.reorderSections(currentPage.id, sectionIds);

      // 3. Save page SEO updates
      if (Object.keys(pendingPageUpdates.current).length > 0) {
        await websitePageBuilderService.updatePage(currentPage.id, pendingPageUpdates.current);
      }

      // 3b. F9.3 — Save page_settings (layout de página)
      if (pendingPageSettings.current !== null) {
        await websitePageBuilderService.updatePage(currentPage.id, { page_settings: pendingPageSettings.current });
      }

      // 4. Save global settings
      if (Object.keys(pendingSettingsUpdates.current).length > 0) {
        // F4 R2 — Si el outlet no tiene fila propia, usar upsert (updateSettings)
        // para crear la fila del outlet en vez de UPDATE directo que no afectaría filas
        if (selectedBranchId !== null && !outletSettingsExists) {
          const upserted = await websiteSettingsService.updateSettings(
            organizationId,
            pendingSettingsUpdates.current,
            selectedBranchId,
          );
          setSettings(upserted);
          setOutletSettingsExists(true);
        } else {
        // Separar campos de tema (colores, fuentes, etc.) de campos del header
        const headerConfigKeys: readonly string[] = CLAVES_ENCABEZADO;
        const themeUpdates: Record<string, unknown> = {};
        const headerUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(pendingSettingsUpdates.current)) {
          if (headerConfigKeys.includes(key)) {
            headerUpdates[key] = value;
          } else {
            themeUpdates[key] = value;
          }
        }

        let updatedSettings: WebsiteSettings | null = null;
        if (Object.keys(themeUpdates).length > 0) {
          updatedSettings = await websiteSettingsService.updateTheme(
            organizationId,
            themeUpdates as Parameters<typeof websiteSettingsService.updateTheme>[1],
            selectedBranchId,
          );
        }
        if (Object.keys(headerUpdates).length > 0) {
          // Separar campos de footer para usar updateFooterConfig
          const footerKeys: readonly string[] = CLAVES_PIE;
          const footerUpdates: Record<string, unknown> = {};
          const pureHeaderUpdates: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(headerUpdates)) {
            if (footerKeys.includes(key)) {
              footerUpdates[key] = value;
            } else {
              pureHeaderUpdates[key] = value;
            }
          }

          if (Object.keys(pureHeaderUpdates).length > 0) {
            updatedSettings = await websiteSettingsService.updateHeaderConfig(
              organizationId,
              pureHeaderUpdates as Parameters<typeof websiteSettingsService.updateHeaderConfig>[1],
              selectedBranchId,
            );
          }
          if (Object.keys(footerUpdates).length > 0) {
            updatedSettings = await websiteSettingsService.updateFooterConfig(
              organizationId,
              footerUpdates as Parameters<typeof websiteSettingsService.updateFooterConfig>[1],
              selectedBranchId,
            );
          }
        }
        if (updatedSettings) setSettings(updatedSettings);
        } // fin else (outlet tiene fila propia o es global)
      }

      // 5. Sync gallery/testimonials/FAQ items to website_settings
      const contentSync: Parameters<typeof websiteSettingsService.updateContent>[1] = {};
      for (const section of currentPage.sections) {
        // F2.2: gallery usa clave canónica `images` con fallback `items` (retrocompatibilidad)
        const sectionItems = section.section_type === 'gallery'
          ? (section.content?.images ?? section.content?.items)
          : section.content?.items;
        if (!sectionItems || !Array.isArray(sectionItems)) continue;
        if (section.section_type === 'gallery') {
          contentSync.gallery_images = sectionItems;
        } else if (section.section_type === 'testimonials') {
          contentSync.testimonials = sectionItems;
        } else if (section.section_type === 'faq') {
          contentSync.faq_items = sectionItems;
        }
      }
      if (Object.keys(contentSync).length > 0) {
        // F4 R2 — Si el outlet no tiene fila propia, usar upsert para contentSync
        const synced = selectedBranchId !== null && !outletSettingsExists
          ? await websiteSettingsService.updateSettings(organizationId, contentSync, selectedBranchId)
          : await websiteSettingsService.updateContent(organizationId, contentSync, selectedBranchId);
        setSettings(synced);
        if (selectedBranchId !== null && !outletSettingsExists) {
          setOutletSettingsExists(true);
        }
      }

      // 6. Save menu tree updates (header_order, menu_icon, menu_badge, etc.)
      if (pendingMenuUpdates.current.size > 0) {
        const menuPromises: Promise<unknown>[] = [];
        pendingMenuUpdates.current.forEach((updates, pageId) => {
          menuPromises.push(
            websitePageBuilderService.updatePageMenu(pageId, updates as Parameters<typeof websitePageBuilderService.updatePageMenu>[1])
          );
        });
        await Promise.all(menuPromises);
      }

      // Reset pending
      pendingSectionUpdates.current.clear();
      pendingSettingsUpdates.current = {};
      pendingPageUpdates.current = {};
      pendingPageSettings.current = null;
      pendingMenuUpdates.current.clear();
      setHasChanges(false);
      setPreviewRefreshKey((k) => k + 1);

      toast({
        title: 'Cambios guardados',
        description: 'Todos los cambios se han guardado correctamente',
      });
    } catch (error) {
      console.error('Error saving:', mensajeError(error) || error);
      toast({
        title: 'Error al guardar',
        description: mensajeError(error) || 'No se pudieron guardar los cambios. Verifica permisos.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ---- PREVIEW URL for current page ----
  // F9.4 — Las plantillas de detalle y flujo apuntan a rutas reales, no al slug __
  const DETAIL_ROUTE_MAP: Record<string, string> = {
    product_detail: 'productos',
    category_detail: 'categorias',
    cart: 'carrito',
    checkout: 'checkout',
    order_confirmation: 'pedido',
    space_detail: 'espacios',
    account: 'mi-cuenta',
  };

  const isDetailOrFlowPage = currentPage ? !!DETAIL_ROUTE_MAP[currentPage.page_type] : false;

  const currentPreviewUrl = previewUrl
    ? currentPage?.slug === 'home'
      ? previewUrl
      : isDetailOrFlowPage
        ? `${previewUrl}/${DETAIL_ROUTE_MAP[currentPage!.page_type]}${previewEntityId ? `/${previewEntityId}` : ''}`
        : `${previewUrl}/${currentPage?.slug || ''}`
    : null;

  // «Faltan datos» de una sección con los conteos reales del ERP (null mientras cargan).
  const sujetoDatos = esSedeV2
    ? sucursalesV2.find((sc) => sc.id === editorV2?.sitio.branchId)?.nombre ?? 'Esta sede'
    : 'Tu organización';
  const avisoDeSeccion = (section: WebsitePageSection) =>
    avisoFaltanDatos(
      section.section_type,
      getSectionDefinition(section.section_type)?.label ?? section.section_type,
      conteoFuentes,
      sujetoDatos,
    );

  // ---- VISTA PREVIA (Figma 1896:920550) ----
  // Con borrador: guarda lo pendiente, pide un enlace privado firmado y lo abre en otra pestaña.
  // Sin borrador: abre lo guardado (?preview=1), que es lo mismo que ven los clientes.
  const abrirVistaPrevia = async () => {
    if (!enV2 || !editorV2) {
      if (!currentPreviewUrl) return;
      try {
        const url = new URL(currentPreviewUrl);
        url.searchParams.set('preview', '1');
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
      } catch {
        window.open(currentPreviewUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (!previewUrl) {
      toast({ title: 'El sitio aún no tiene dirección', description: 'Configura el subdominio del sitio para ver la vista previa.' });
      return;
    }
    // La pestaña se abre ya (en el clic) para que el navegador no la bloquee; luego se le da la URL.
    const pestana = window.open('', '_blank');
    if (pestana) pestana.opener = null;
    setGenerandoVistaPrevia(true);
    try {
      if (hasChanges) {
        const version = await guardarV2();
        if (version === null) {
          pestana?.close();
          return;
        }
      }
      const { token } = await clienteSitiosV2.vistaPrevia(editorV2.sitio.id, currentPage?.id ?? null);
      const ruta = currentPage && currentPage.slug !== 'home' && !isDetailOrFlowPage ? `/${currentPage.slug}` : '';
      const destino = `${previewUrl.replace(/\/$/, '')}/vista-previa/${token}${ruta}`;
      if (pestana) pestana.location.href = destino;
      else window.open(destino, '_blank', 'noopener,noreferrer');
    } catch (error) {
      pestana?.close();
      toast({
        title: 'No se pudo abrir la vista previa',
        description: error instanceof ErrorApiSitio ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setGenerandoVistaPrevia(false);
    }
  };

  // ---- Sitios V2: datos derivados para el encabezado ----
  const nombreSitioV2 =
    editorV2?.sitio.branchId == null
      ? 'Sitio principal'
      : sucursalesV2.find((s) => s.id === editorV2.sitio.branchId)?.nombre ?? `Sede ${editorV2.sitio.branchId}`;
  const estadoMostradoV2: EstadoGuardadoV2 = isSaving
    ? 'guardando'
    : estadoGuardadoV2 === 'conflicto' || estadoGuardadoV2 === 'error'
      ? estadoGuardadoV2
      : hasChanges
        ? 'cambios'
        : estadoGuardadoV2;
  const accionesMenuV2 = (() => {
    if (!enV2 || !editorV2) return [];
    const acciones: { id: string; texto: string; onSelect: () => void; deshabilitada?: boolean; peligro?: boolean }[] = [];
    if (esSedeV2) {
      acciones.push({ id: 'herencia', texto: 'Ver lo que se hereda del principal', onSelect: () => setMostrarHerencia(true) });
      const menusSede = new Set(docV2.menus.map((m) => m.id));
      for (const m of editorV2.basePrincipal?.documento.menus ?? []) {
        if (!UUID_MENU.test(m.id) || !menusSede.has(m.id)) continue;
        acciones.push({ id: `copiar-${m.id}`, texto: `Copiar menú «${m.nombre}» a esta sede`, onSelect: () => void llevarMenuV2(m.id), deshabilitada: hasChanges });
      }
    } else {
      for (const m of docV2.menus) {
        if (!UUID_MENU.test(m.id)) continue;
        acciones.push({ id: `menu-${m.id}`, texto: `Actualizar menú «${m.nombre}» en el borrador`, onSelect: () => void llevarMenuV2(m.id), deshabilitada: hasChanges });
      }
    }
    if (editorV2.sitio.v2Adoptado) {
      acciones.push({ id: 'desactivar', texto: 'Desactivar V2 en la web', onSelect: () => setAdopcionPendiente(false), peligro: true });
    } else {
      acciones.push({
        id: 'activar',
        texto: !LECTOR_PUBLICO_V2_LISTO
          ? 'Activar V2 en la web (la web aún no lee V2)'
          : editorV2.sitio.revisionPublicadaId ? 'Activar V2 en la web' : 'Activar V2 en la web (publica primero)',
        onSelect: () => setAdopcionPendiente(true),
        deshabilitada: !LECTOR_PUBLICO_V2_LISTO || !editorV2.sitio.revisionPublicadaId,
      });
      if (!esSedeV2) {
        acciones.push({ id: 'legacy', texto: 'Editar el sitio actual (sin V2)', onSelect: () => void salirDeV2(), deshabilitada: hasChanges });
      }
    }
    return acciones;
  })();

  // ---- LOADING STATE ----
  if (isLoading || !organization) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando editor...</p>
        </div>
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center space-y-3">
          <p className="text-lg text-gray-800 dark:text-white">Página no encontrada</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            La página que intentas editar no existe o no pertenece a tu organización.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Header */}
      <EditorHeader
        pages={pages}
        currentPageId={currentPage.id}
        onPageChange={handlePageChange}
        devicePreview={devicePreview}
        onDeviceChange={setDevicePreview}
        isSaving={isSaving}
        onSave={handleSave}
        hasChanges={hasChanges}
        previewUrl={currentPreviewUrl}
        previewEntities={previewEntities}
        previewEntityId={previewEntityId}
        onPreviewEntityChange={setPreviewEntityId}
        outletOptions={enV2 ? undefined : outletOptions}
        selectedBranchId={selectedBranchId}
        onOutletChange={enV2 ? undefined : handleOutletChange}
        selectedBranch={selectedBranch}
        currentPageIsGlobal={enV2 ? false : currentPage.branch_id === null || currentPage.branch_id === undefined}
        ocultarIndicadorOutlet={enV2}
        etiquetaGuardar={enV2 ? 'Guardar borrador' : undefined}
        vistaPrevia={
          currentPreviewUrl
            ? { borrador: enV2, cargando: generandoVistaPrevia, onAbrir: () => void abrirVistaPrevia() }
            : undefined
        }
        controlSitio={
          apiV2Disponible ? (
            <SelectorSitio
              sitios={sitiosV2}
              sucursales={sucursalesV2}
              branchActivo={enV2 ? editorV2.sitio.branchId : undefined}
              cargando={cargandoV2}
              onElegir={(branchId) => void elegirSitio(branchId)}
            />
          ) : null
        }
        accionesSitio={
          enV2 ? (
            <AccionesSitioV2
              estado={estadoMostradoV2}
              nombrePublicar={esSedeV2 ? `Publicar ${nombreSitioV2}` : 'Publicar'}
              publicando={publicando}
              puedePublicar={editorV2.erroresContrato === 0 || hasChanges}
              onHistorial={() => setMostrarHistorial(true)}
              onPublicar={() => setMostrarPublicar(true)}
              acciones={accionesMenuV2}
            />
          ) : null
        }
        banda={
          enV2 ? (
            <BandaSitioV2
              esSede={esSedeV2}
              nombreSitio={nombreSitioV2}
              v2Adoptado={editorV2.sitio.v2Adoptado}
              personalizados={contarPersonalizados(origenesV2)}
              baseDesdeLegacy={editorV2.basePrincipal?.origen === 'legacy'}
              erroresContrato={editorV2.erroresContrato}
              onVerPersonalizado={() => setMostrarHerencia(true)}
              onIrPrincipal={() => void elegirSitio(null)}
            />
          ) : null
        }
      />

      {/* Main Content: Sidebar + Preview */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Sidebar */}
        <EditorSidebar
          sections={currentPage.sections}
          activeSectionId={activeSectionId}
          onSelectSection={seleccionarSeccion}
          onUpdateSectionContent={handleUpdateSectionContent}
          onUpdateSectionVariant={handleUpdateSectionVariant}
          onToggleVisibility={handleToggleVisibility}
          onDeleteSection={handleDeleteSection}
          onAddSection={() => {
            recargarConteoFuentes();
            setShowAddDialog(true);
          }}
          onReorder={handleReorder}
          onDuplicateSection={handleDuplicateSection}
          onCopyStyle={handleCopyStyle}
          onPasteStyle={handlePasteStyle}
          onApplyStyleToAll={handleApplyStyleToAll}
          onSaveSectionAsPreset={handleSaveSectionAsPreset}
          onUndo={undoSections}
          onRedo={redoSections}
          canUndo={canUndo}
          canRedo={canRedo}
          sectionSearch={sectionSearch}
          onSectionSearchChange={setSectionSearch}
          pageType={currentPage.page_type}
          onMaterializeDefaultSections={handleMaterializeDefaultSections}
          showGlobalSettings={showGlobalSettings}
          onToggleGlobalSettings={() => setShowGlobalSettings(!showGlobalSettings)}
          globalSettingsContent={
            settings ? (
              <GlobalSettingsPanel
                settings={settings}
                onUpdate={handleUpdateGlobalSettings}
                pages={pages}
                onTogglePageHeader={handleTogglePageHeader}
              />
            ) : null
          }
          showPageSEO={showPageSEO}
          onTogglePageSEO={() => setShowPageSEO(!showPageSEO)}
          pageSEOContent={
            <PageSEOPanel
              metaTitle={currentPage.meta_title || ''}
              metaDescription={currentPage.meta_description || ''}
              ogImageUrl={currentPage.og_image_url || ''}
              onUpdate={handleUpdatePageSEO}
            />
          }
          zonaGlobalActiva={zonaGlobal}
          onSelectZonaGlobal={seleccionarZonaGlobal}
          // V2: `page_settings` no tiene destino en el contrato del documento (se reporta).
          showPageLayout={enV2 ? undefined : showPageLayout}
          onTogglePageLayout={enV2 ? undefined : () => setShowPageLayout(!showPageLayout)}
          edicionSede={
            esSedeV2
              ? {
                  nombre: nombreSitioV2,
                  ambito: (section) => ambitoSeccionSede(section.id),
                  bloqueada: (section) => ambitoSeccionSede(section.id) === 'heredada',
                  onPersonalizar: personalizarSeccionV2,
                  onRestablecer: restablecerSeccionV2,
                }
              : null
          }
          avisoSeccion={avisoDeSeccion}
          onEditarCarta={(sectionId) => setCartaAbierta({ sectionId, plato: null })}
          pageLayoutContent={
            <PageLayoutPanel
              pageType={currentPage.page_type}
              pageSettings={currentPage.page_settings}
              onUpdate={handleUpdatePageSettings}
            />
          }
          organizationId={organizationId}
          themePalette={
            settings
              ? {
                  primary: settings.primary_color || '#3B82F6',
                  secondary: settings.secondary_color || '#6366F1',
                  accent: settings.accent_color || '#F59E0B',
                  background: settings.background_color || '#FFFFFF',
                  text: settings.text_color || '#000000',
                }
              : undefined
          }
          activeViewport={devicePreview === 'laptop' ? 'desktop' : devicePreview}
          sectionManifest={sectionManifest}
        />

        {/* Right Preview */}
        <EditorPreview
          previewUrl={currentPreviewUrl}
          devicePreview={devicePreview}
          refreshKey={previewRefreshKey}
          liveSections={currentPage.sections}
          activeSectionId={activeSectionId ?? zonaGlobal}
          onSelectSectionFromCanvas={handleSelectFromCanvas}
          avisoSeccion={avisoDeSeccion}
          ajustesVivos={ajustesVivos}
          cartaSede={cambiosCartaSede}
          onAccionSeccion={(sectionId, accion) => {
            if (accion === 'quitar') handleDeleteSection(sectionId);
          }}
        />

        {/* Inspector derecho del encabezado / pie (Figma «05 Editor») */}
        {settings && zonaGlobal === 'header' && (
          <HeaderInspector
            key="header"
            settings={settings}
            onUpdate={handleUpdateGlobalSettings}
            availableMenus={availableMenus.map((m) => ({ id: m.id, name: m.name }))}
            devicePreview={devicePreview}
            onEditarMenu={() => abrirHojaMenu('header')}
            onCerrar={() => setZonaGlobal(null)}
          />
        )}
        {settings && zonaGlobal === 'footer' && (
          <FooterInspector
            key="footer"
            settings={settings}
            onUpdate={handleUpdateGlobalSettings}
            devicePreview={devicePreview}
            onEditarMenus={() => abrirHojaMenu('footer')}
            onCerrar={() => setZonaGlobal(null)}
          />
        )}
      </div>

      {/* Constructor del menú en hoja lateral: el lienzo sigue a la vista */}
      {organizationId && zonaGlobal && (
        <HojaMenu
          abierto={hojaMenuAbierta}
          onAbiertoChange={handleHojaMenuChange}
          zona={zonaGlobal}
          organizationId={organizationId}
          menuEncabezado={
            settings?.header_menu_id
              ? {
                  id: settings.header_menu_id,
                  name: availableMenus.find((m) => m.id === settings.header_menu_id)?.name ?? 'Menú asignado',
                }
              : null
          }
          pendingMenuUpdatesRef={pendingMenuUpdates}
          onPendingChanges={(hayPendientes) => {
            if (hayPendientes) setHasChanges(true);
          }}
        />
      )}

      {/* Constructor de la carta (menu_full) */}
      {organizationId && cartaAbierta && (() => {
        const seccionCarta = currentPage.sections.find((s) => s.id === cartaAbierta.sectionId);
        if (!seccionCarta) return null;
        const branchCarta = enV2 ? editorV2.sitio.branchId : selectedBranchId;
        return (
          <ConstructorCarta
            abierto
            onAbiertoChange={(abierto) => {
              if (!abierto) {
                setCartaAbierta(null);
                setCambiosCartaSede(null);
              }
            }}
            organizationId={organizationId}
            section={seccionCarta}
            onCambiarContenido={(content) => handleUpdateSectionContent(seccionCarta.id, content)}
            onCambiarVariante={(variante) => handleUpdateSectionVariant(seccionCarta.id, variante)}
            sede={
              branchCarta !== null && branchCarta !== undefined
                ? {
                    branchId: branchCarta,
                    nombre: enV2 ? nombreSitioV2 : selectedBranch?.name ?? `Sede ${branchCarta}`,
                  }
                : null
            }
            platoInicial={cartaAbierta.plato}
            onCambiosSede={(branchId, cambios) => setCambiosCartaSede(cambios.length > 0 ? { branchId, cambios } : null)}
          />
        );
      })()}

      {/* Add Section Dialog */}
      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        branchType={selectedBranch?.branch_type ?? null}
        pageType={currentPage.page_type}
        conteos={conteoFuentes}
        contexto={{
          pagina: currentPage.title,
          despuesDe: (() => {
            const i = indiceInsercion() - 1;
            const previa = i >= 0 ? currentPage.sections[i] : null;
            return previa ? getSectionDefinition(previa.section_type)?.label ?? previa.section_type : null;
          })(),
          sede: esSedeV2 ? nombreSitioV2 : null,
          nombreSitio: enV2 ? nombreSitioV2 : selectedBranch?.name ?? 'Principal',
          enBorrador: enV2,
        }}
      />

      {/* Confirmar descartar cambios al cambiar de página */}
      <ConfirmDialog
        open={pendingPageChange !== null}
        onOpenChange={(open) => { if (!open) setPendingPageChange(null); }}
        title="Descartar cambios"
        description="Tienes cambios sin guardar. ¿Deseas descartarlos y cambiar de página?"
        confirmLabel="Descartar y cambiar"
        variant="destructive"
        onConfirm={async () => {
          if (pendingPageChange) await doPageChange(pendingPageChange);
          setPendingPageChange(null);
        }}
      />

      {/* Confirmar eliminar sección */}
      <ConfirmDialog
        open={pendingDeleteSection !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteSection(null); }}
        title="Eliminar sección"
        description={
          enV2
            ? '¿Quitar esta sección del borrador? Lo publicado no cambia hasta que publiques.'
            : '¿Seguro que deseas eliminar esta sección? Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => { await doDeleteSection(); }}
      />

      {/* Fase 4 §6.5 — Confirmar cambio de outlet con cambios sin guardar */}
      <ConfirmDialog
        open={pendingOutletChange !== undefined}
        onOpenChange={(open) => { if (!open) setPendingOutletChange(undefined); }}
        title="Cambiar de outlet"
        description="Tienes cambios sin guardar. Si cambias de outlet, se perderán. ¿Deseas continuar?"
        confirmLabel="Cambiar outlet"
        variant="destructive"
        onConfirm={async () => {
          const branchId = pendingOutletChange;
          setPendingOutletChange(undefined);
          if (branchId !== undefined) {
            await doOutletChange(branchId);
          }
        }}
      />

      {/* ---- Sitios V2 ---- */}
      <ConfirmDialog
        open={sitioPorCrear !== undefined}
        onOpenChange={(open) => { if (!open && !creandoSitio) setSitioPorCrear(undefined); }}
        title={sitioPorCrear === null ? 'Crear el borrador V2 del sitio principal' : `Crear el sitio de ${sucursalesV2.find((s) => s.id === sitioPorCrear)?.nombre ?? 'la sede'}`}
        description={
          sitioPorCrear === null
            ? 'Se copia el sitio actual (páginas, secciones, estilo, encabezado, pie y menús) a un borrador. La web no cambia: sigue mostrando el sitio actual hasta que publiques y actives V2.'
            : 'La sede tendrá su propio borrador y su propia publicación. Hereda del sitio principal todo lo que no personalices. Nada se publica hasta que lo decidas.'
        }
        confirmLabel={sitioPorCrear === null ? 'Crear borrador' : 'Crear sitio de la sede'}
        loading={creandoSitio}
        onConfirm={crearSitioV2}
      />

      {enV2 && (
        <>
          <DialogoPublicar
            abierto={mostrarPublicar}
            onAbiertoChange={setMostrarPublicar}
            nombreSitio={nombreSitioV2}
            esSede={esSedeV2}
            principalConCambiosSinPublicar={editorV2.basePrincipal?.principalConCambiosSinPublicar}
            v2Adoptado={editorV2.sitio.v2Adoptado}
            publicando={publicando}
            onPublicar={publicarV2}
          />
          <PanelHistorial
            abierto={mostrarHistorial}
            onAbiertoChange={setMostrarHistorial}
            sitioId={editorV2.sitio.id}
            branchId={editorV2.sitio.branchId}
            hayCambiosLocales={hasChanges}
            borradorActualizadoEn={editorV2.actualizadoEn}
            onRestaurar={restaurarV2}
          />
          <DialogoConflicto
            abierto={conflictoV2 !== null}
            onAbiertoChange={(open) => { if (!open) setConflictoV2(null); }}
            versionLocal={editorV2.version}
            versionServidor={conflictoV2?.versionServidor ?? null}
            onCargarNueva={async () => {
              setConflictoV2(null);
              await entrarV2(editorV2.sitio, currentPage.id);
            }}
            onSobrescribir={async () => {
              const actual = await clienteSitiosV2.borrador(editorV2.sitio.id);
              setConflictoV2(null);
              await guardarV2(actual.version);
            }}
          />
          {esSedeV2 && (
            <PanelHerencia
              abierto={mostrarHerencia}
              onAbiertoChange={setMostrarHerencia}
              nombreSede={nombreSitioV2}
              origenes={origenesV2}
              valores={(settings ?? {}) as unknown as Record<string, unknown>}
              onHeredar={(columna) => fijarHerenciaCampo(columna, 'inherit')}
              onVaciar={(columna) => fijarHerenciaCampo(columna, 'clear')}
            />
          )}
          <ConfirmDialog
            open={adopcionPendiente !== null}
            onOpenChange={(open) => { if (!open && !cambiandoAdopcion) setAdopcionPendiente(null); }}
            title={adopcionPendiente ? `Activar V2 en la web de ${nombreSitioV2}` : `Desactivar V2 en ${nombreSitioV2}`}
            description={
              adopcionPendiente
                ? 'La web de este sitio pasará a mostrar su última versión publicada en V2. Puedes desactivarlo después sin perder nada.'
                : esSedeV2
                  ? 'La web de esta sede dejará de mostrarse (no vuelve al sitio principal). El borrador y las versiones se conservan.'
                  : 'La web vuelve a mostrar el sitio anterior. El borrador y las versiones se conservan.'
            }
            confirmLabel={adopcionPendiente ? 'Activar V2' : 'Desactivar V2'}
            variant={adopcionPendiente ? 'default' : 'destructive'}
            loading={cambiandoAdopcion}
            onConfirm={() => cambiarAdopcionV2(Boolean(adopcionPendiente))}
          />
        </>
      )}
    </div>
  );
}
