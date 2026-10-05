'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { getAllowedSectionTypes } from '@/lib/services/website/sectionsByBranchType';
import { branchService } from '@/lib/services/branchService';
import type { Branch } from '@/types/branch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
  const handleSelectFromCanvas = (id: string, detalle: { enlace: boolean }) => {
    if (esZonaGlobal(id)) {
      if (detalle.enlace && zonaGlobal === id) setHojaMenuAbierta(true);
      seleccionarZonaGlobal(id);
      return;
    }
    seleccionarSeccion(id);
  };

  // Al cerrar la hoja: los menús nombrados se guardan al momento, así que se
  // recargan la lista de menús y el lienzo. El árbol de páginas queda
  // pendiente hasta «Guardar».
  const handleHojaMenuChange = async (abierta: boolean) => {
    setHojaMenuAbierta(abierta);
    if (abierta || !organizationId) return;
    if (zonaGlobal === 'footer' || settings?.header_menu_id) {
      setPreviewRefreshKey((k) => k + 1);
      try {
        setAvailableMenus(await websiteMenuGroupService.getMenus(organizationId));
      } catch {
        // La lista se vuelve a cargar con el editor; no bloquea.
      }
    }
  };

  // ---- PAGE CHANGE ----
  const handlePageChange = async (newPageId: string) => {
    if (hasChanges) {
      setPendingPageChange(newPageId);
      return;
    }
    await doPageChange(newPageId);
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
  const handleAddSection = async (sectionType: string, sectionVariant: string) => {
    if (!currentPage || !organizationId) return;

    try {
      const newSection = await websitePageBuilderService.addSection({
        page_id: currentPage.id,
        organization_id: organizationId,
        section_type: sectionType,
        section_variant: sectionVariant,
        sort_order: currentPage.sections.length,
      });

      setCurrentPage((prev) => {
        if (!prev) return prev;
        const newSections = [...prev.sections, newSection];
        setSectionsState(newSections);
        return { ...prev, sections: newSections };
      });

      setActiveSectionId(newSection.id);
      toast({ title: 'Sección agregada', description: `${sectionType}/${sectionVariant}` });
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

    setSettings((prev) => (prev ? { ...prev, ...updates } : prev));
    pendingSettingsUpdates.current = {
      ...pendingSettingsUpdates.current,
      ...updates,
    };
    setHasChanges(true);
  };

  // ---- TOGGLE PAGE IN HEADER ----
  const handleTogglePageHeader = async (pageId: string, show: boolean) => {
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
        const headerConfigKeys = [
          'header_style', 'footer_style', 'logo_position', 'header_cta_text', 'header_cta_url',
          'show_header_cart', 'show_header_auth', 'show_topbar', 'menu_position', 'search_style',
          'show_categories_in_header', 'categories_menu_style', 'mega_menu_columns',
          'mobile_menu_style', 'mobile_search_style', 'mobile_show_topbar', 'mobile_sticky_header',
          'mobile_breakpoint', 'header_opacity',
          'header_bg_color', 'topbar_bg_color', 'nav_bg_color', 'accent_color',
          'topbar_show_email', 'topbar_show_phone', 'topbar_announcement', 'topbar_contact_position',
          // Fase 12: iconos personalizables y orden de acciones
          'cart_icon', 'search_icon', 'auth_icon', 'currency_icon',
          'minimal_menu_style', 'actions_order',
          // Fase 12C: CTA personalizable
          'cta_padding_x', 'cta_padding_y', 'cta_border_radius', 'cta_border_width',
          'cta_border_color', 'cta_full_width', 'cta_shadow', 'cta_bg_color',
          'cta_text_color', 'cta_margin_top', 'cta_margin_bottom',
          // Footer config (Fase 2)
          'footer_style', 'footer_columns', 'footer_background', 'footer_custom_bg_color',
          'footer_show_contact', 'footer_show_hours', 'footer_show_social', 'footer_show_categories',
          'footer_show_newsletter', 'footer_newsletter_title', 'footer_newsletter_placeholder',
          'footer_newsletter_button_text', 'footer_text', 'show_powered_by',
          'mobile_footer_style', 'mobile_footer_show_social', 'mobile_footer_show_hours',
          'header_menu_id', 'header_mega_menu_id',
        ];
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
          const footerKeys = [
            'footer_style', 'footer_columns', 'footer_background', 'footer_custom_bg_color',
            'footer_show_contact', 'footer_show_hours', 'footer_show_social', 'footer_show_categories',
            'footer_show_newsletter', 'footer_newsletter_title', 'footer_newsletter_placeholder',
            'footer_newsletter_button_text', 'footer_text', 'show_powered_by',
            'mobile_footer_style', 'mobile_footer_show_social', 'mobile_footer_show_hours',
            'header_menu_id', 'header_mega_menu_id',
          ];
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

  // Fase 4 §3.3 — Secciones permitidas según branch_type del outlet seleccionado
  const allowedSectionTypes = getAllowedSectionTypes(selectedBranch?.branch_type);

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
        outletOptions={outletOptions}
        selectedBranchId={selectedBranchId}
        onOutletChange={handleOutletChange}
        selectedBranch={selectedBranch}
        currentPageIsGlobal={currentPage.branch_id === null || currentPage.branch_id === undefined}
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
          onAddSection={() => setShowAddDialog(true)}
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
          showPageLayout={showPageLayout}
          onTogglePageLayout={() => setShowPageLayout(!showPageLayout)}
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
        />

        {/* Inspector derecho del encabezado / pie (Figma «05 Editor») */}
        {settings && zonaGlobal === 'header' && (
          <HeaderInspector
            key="header"
            settings={settings}
            onUpdate={handleUpdateGlobalSettings}
            availableMenus={availableMenus.map((m) => ({ id: m.id, name: m.name }))}
            devicePreview={devicePreview}
            onEditarMenu={() => setHojaMenuAbierta(true)}
            onCerrar={() => setZonaGlobal(null)}
          />
        )}
        {settings && zonaGlobal === 'footer' && (
          <FooterInspector
            key="footer"
            settings={settings}
            onUpdate={handleUpdateGlobalSettings}
            devicePreview={devicePreview}
            onEditarMenus={() => setHojaMenuAbierta(true)}
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

      {/* Add Section Dialog */}
      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        existingSectionTypes={currentPage.sections.map((s) => s.section_type)}
        allowedSectionTypes={allowedSectionTypes}
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
        description="¿Seguro que deseas eliminar esta sección? Esta acción no se puede deshacer."
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
    </div>
  );
}
