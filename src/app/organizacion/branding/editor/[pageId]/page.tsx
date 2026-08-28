'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  HeaderLayoutSelector,
  HeaderOptionsPanel,
  MobileHeaderPanel,
  MenuTreeEditor,
  HeaderPreviewMockup,
  FooterLayoutSelector,
  FooterOptionsPanel,
  MobileFooterPanel,
  FooterPreviewMockup,
  MenuGroupManager,
  type DevicePreview,
} from '@/components/organization/branding/editor';
import { useHistory } from '@/components/organization/branding/editor/useHistory';
import { extractStyle, applyStyle } from '@/components/organization/branding/editor/styleUtils';
import { websiteMenuGroupService, type MenuGroup } from '@/lib/services/websiteMenuGroupService';
import type { SectionManifest } from '@/lib/services/website/sectionContract';
import { getDefaultSectionsForPageType } from '@/lib/services/website/defaultProductDetailSections';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function PageEditorPage() {
  const params = useParams();
  const router = useRouter();
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
  const [showMenuConfig, setShowMenuConfig] = useState(false);
  const [showFooterConfig, setShowFooterConfig] = useState(false);
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
  const styleClipboard = useRef<Record<string, any> | null>(null);

  // F12.4 — Filtro de búsqueda de secciones en el sidebar
  const [sectionSearch, setSectionSearch] = useState('');

  // Pending changes (batched for save)
  const pendingSectionUpdates = useRef<Map<string, Partial<WebsitePageSection>>>(new Map());
  const pendingSettingsUpdates = useRef<Partial<WebsiteSettings>>({});
  const pendingPageUpdates = useRef<Record<string, string>>({});
  // F9.3 — Cambios pendientes de page_settings (layout de página)
  const pendingPageSettings = useRef<Record<string, any> | null>(null);
  // Cambios pendientes del MenuTreeEditor (header_order, menu_icon, etc.)
  const pendingMenuUpdates = useRef<Map<string, Record<string, unknown>>>(new Map());

  // ---- LOAD DATA ----
  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      setIsLoading(true);

      const [pagesData, pageData, settingsData, preview] = await Promise.all([
        websitePageBuilderService.getPages(organizationId),
        websitePageBuilderService.getPageWithSections(pageId),
        websiteSettingsService.getSettings(organizationId),
        websitePageBuilderService.getPreviewUrl(organizationId),
      ]);

      setPages(pagesData);
      setCurrentPage(pageData);
      setSettings(settingsData);
      setPreviewUrl(preview);

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
  useEffect(() => {
    if (!organizationId || !currentPage) return;
    const pageType = currentPage.page_type;
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
        if (entities.length > 0 && !previewEntityId) {
          setPreviewEntityId(entities[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewEntities([]);
      });
    return () => { cancelled = true; };
  }, [organizationId, currentPage?.page_type]);

  // F12.3 — Sincronizar la pila de undo/redo cuando se carga una página nueva.
  useEffect(() => {
    if (currentPage?.sections) {
      resetSections(currentPage.sections);
    }
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
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          setActiveSectionId(null);
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
  }, [canUndo, canRedo, undoSections, redoSections, hasChanges, isSaving, activeSectionId]);

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
      const pageData = await websitePageBuilderService.getPageWithSections(newPageId);
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

  // ---- SECTION UPDATES (local state, batch for save) ----
  const handleUpdateSectionContent = (sectionId: string, content: Record<string, any>) => {
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
    } as any);
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
      toast({ title: 'Sección duplicada' });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'No se pudo duplicar', variant: 'destructive' });
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
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'No se pudo guardar la plantilla', variant: 'destructive' });
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
      const pageData = await websitePageBuilderService.getPageWithSections(currentPage.id);
      setCurrentPage(pageData);
      if (pageData?.sections) resetSections(pageData.sections);
      setPreviewRefreshKey((k) => k + 1);
      toast({ title: 'Secciones materializadas', description: `${created.length} secciones por defecto creadas.` });
    } catch (error: any) {
      console.error('Error materializing default sections:', error);
      toast({
        title: 'Error',
        description: error?.message || 'No se pudieron materializar las secciones por defecto.',
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
  const handleUpdatePageSettings = (settings: Record<string, any>) => {
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
      const sectionPromises: Promise<any>[] = [];
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
        await websitePageBuilderService.updatePage(currentPage.id, pendingPageUpdates.current as any);
      }

      // 3b. F9.3 — Save page_settings (layout de página)
      if (pendingPageSettings.current !== null) {
        await websitePageBuilderService.updatePage(currentPage.id, { page_settings: pendingPageSettings.current } as any);
      }

      // 4. Save global settings
      if (Object.keys(pendingSettingsUpdates.current).length > 0) {
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
        const themeUpdates: Record<string, any> = {};
        const headerUpdates: Record<string, any> = {};
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
            themeUpdates as any
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
          const footerUpdates: Record<string, any> = {};
          const pureHeaderUpdates: Record<string, any> = {};
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
              pureHeaderUpdates as any
            );
          }
          if (Object.keys(footerUpdates).length > 0) {
            updatedSettings = await websiteSettingsService.updateFooterConfig(
              organizationId,
              footerUpdates as any
            );
          }
        }
        if (updatedSettings) setSettings(updatedSettings);
      }

      // 5. Sync gallery/testimonials/FAQ items to website_settings
      const contentSync: Record<string, any> = {};
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
        const synced = await websiteSettingsService.updateContent(
          organizationId,
          contentSync
        );
        setSettings(synced);
      }

      // 6. Save menu tree updates (header_order, menu_icon, menu_badge, etc.)
      if (pendingMenuUpdates.current.size > 0) {
        const menuPromises: Promise<unknown>[] = [];
        pendingMenuUpdates.current.forEach((updates, pageId) => {
          menuPromises.push(
            websitePageBuilderService.updatePageMenu(pageId, updates as any)
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
    } catch (error: any) {
      console.error('Error saving:', error?.message || error);
      toast({
        title: 'Error al guardar',
        description: error?.message || 'No se pudieron guardar los cambios. Verifica permisos.',
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
      />

      {/* Main Content: Sidebar + Preview */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Sidebar */}
        <EditorSidebar
          sections={currentPage.sections}
          activeSectionId={activeSectionId}
          onSelectSection={setActiveSectionId}
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
          showMenuConfig={showMenuConfig}
          onToggleMenuConfig={() => setShowMenuConfig(!showMenuConfig)}
          menuConfigContent={
            settings ? (
              <div className="space-y-4">
                <HeaderLayoutSelector
                  currentLayout={settings.header_style || 'default'}
                  onSelect={(layout) => handleUpdateGlobalSettings({ header_style: layout })}
                />
                <HeaderPreviewMockup
                  layout={settings.header_style || 'default'}
                  logoPosition={settings.logo_position || 'left'}
                  menuPosition={settings.menu_position || 'inline'}
                  searchStyle={settings.search_style || 'icon'}
                  showTopbar={settings.show_topbar ?? false}
                  showCart={settings.show_header_cart ?? false}
                  showAuth={settings.show_header_auth ?? false}
                  ctaText={settings.header_cta_text || null}
                  isMobile={devicePreview === 'mobile'}
                  mobileMenuStyle={settings.mobile_menu_style || 'drawer'}
                  headerOpacity={settings.header_opacity ?? 95}
                />
                <HeaderOptionsPanel
                  settings={{
                    header_style: settings.header_style || 'default',
                    logo_position: settings.logo_position || 'left',
                    menu_position: settings.menu_position || 'inline',
                    search_style: settings.search_style || 'icon',
                    show_categories_in_header: settings.show_categories_in_header ?? false,
                    categories_menu_style: settings.categories_menu_style || 'dropdown',
                    mega_menu_columns: settings.mega_menu_columns ?? 4,
                    header_cta_text: settings.header_cta_text,
                    header_cta_url: settings.header_cta_url,
                    show_header_cart: settings.show_header_cart ?? false,
                    show_header_auth: settings.show_header_auth ?? false,
                    show_topbar: settings.show_topbar ?? false,
                    header_opacity: settings.header_opacity ?? 95,
                    header_bg_color: settings.header_bg_color ?? null,
                    topbar_bg_color: settings.topbar_bg_color ?? null,
                    nav_bg_color: settings.nav_bg_color ?? null,
                    accent_color: settings.accent_color ?? null,
                    topbar_show_email: settings.topbar_show_email ?? true,
                    topbar_show_phone: settings.topbar_show_phone ?? true,
                    topbar_announcement: settings.topbar_announcement ?? null,
                    topbar_contact_position: settings.topbar_contact_position ?? 'left',
                    header_menu_id: settings.header_menu_id ?? null,
                    header_mega_menu_id: settings.header_mega_menu_id ?? null,
                    minimal_menu_style: settings.minimal_menu_style ?? 'drawer',
                    cart_icon: settings.cart_icon ?? 'shopping-bag',
                    search_icon: settings.search_icon ?? 'search',
                    auth_icon: settings.auth_icon ?? 'user',
                    currency_icon: settings.currency_icon ?? 'globe',
                    actions_order: settings.actions_order ?? ['search', 'currency', 'cart', 'auth'],
                    cta_padding_x: settings.cta_padding_x ?? 16,
                    cta_padding_y: settings.cta_padding_y ?? 8,
                    cta_border_radius: settings.cta_border_radius ?? 8,
                    cta_full_width: settings.cta_full_width ?? false,
                    cta_border_width: settings.cta_border_width ?? 0,
                    cta_border_color: settings.cta_border_color ?? null,
                    cta_shadow: settings.cta_shadow ?? 'none',
                    cta_bg_color: settings.cta_bg_color ?? null,
                    cta_text_color: settings.cta_text_color ?? null,
                    cta_margin_top: settings.cta_margin_top ?? 0,
                    cta_margin_bottom: settings.cta_margin_bottom ?? 0,
                  }}
                  onUpdate={handleUpdateGlobalSettings}
                  availableMenus={availableMenus.map(m => ({ id: m.id, name: m.name }))}
                />
                <MobileHeaderPanel
                  settings={{
                    mobile_menu_style: settings.mobile_menu_style || 'drawer',
                    mobile_search_style: settings.mobile_search_style || 'icon',
                    mobile_show_topbar: settings.mobile_show_topbar ?? false,
                    mobile_sticky_header: settings.mobile_sticky_header ?? true,
                    mobile_breakpoint: settings.mobile_breakpoint ?? 768,
                  }}
                  onUpdate={handleUpdateGlobalSettings}
                />
                {organizationId && (
                  <MenuTreeEditor
                    organizationId={organizationId}
                    pendingUpdatesRef={pendingMenuUpdates}
                    onPendingChanges={(hasPending) => {
                      if (hasPending) setHasChanges(true);
                    }}
                  />
                )}
              </div>
            ) : null
          }
          showFooterConfig={showFooterConfig}
          onToggleFooterConfig={() => setShowFooterConfig(!showFooterConfig)}
          footerConfigContent={
            settings ? (
              <div className="space-y-4">
                <FooterLayoutSelector
                  currentLayout={settings.footer_style || 'default'}
                  onSelect={(layout) => handleUpdateGlobalSettings({ footer_style: layout })}
                />
                <FooterPreviewMockup
                  layout={settings.footer_style || 'default'}
                  columns={settings.footer_columns ?? 4}
                  background={settings.footer_background ?? 'dark'}
                  customBgColor={settings.footer_custom_bg_color ?? null}
                  showContact={settings.footer_show_contact ?? true}
                  showHours={settings.footer_show_hours ?? false}
                  showSocial={settings.footer_show_social ?? true}
                  showNewsletter={settings.footer_show_newsletter ?? false}
                  showCategories={settings.footer_show_categories ?? false}
                  showPoweredBy={settings.show_powered_by ?? true}
                  footerText={settings.footer_text ?? null}
                  newsletterTitle={settings.footer_newsletter_title ?? null}
                  newsletterPlaceholder={settings.footer_newsletter_placeholder ?? null}
                  newsletterButtonText={settings.footer_newsletter_button_text ?? null}
                  isMobile={devicePreview === 'mobile'}
                  mobileStyle={settings.mobile_footer_style ?? 'accordion'}
                  mobileShowSocial={settings.mobile_footer_show_social ?? true}
                  mobileShowHours={settings.mobile_footer_show_hours ?? false}
                />
                <FooterOptionsPanel
                  settings={{
                    footer_style: settings.footer_style || 'default',
                    footer_columns: settings.footer_columns ?? 4,
                    footer_background: settings.footer_background ?? 'dark',
                    footer_custom_bg_color: settings.footer_custom_bg_color ?? null,
                    footer_show_contact: settings.footer_show_contact ?? true,
                    footer_show_hours: settings.footer_show_hours ?? false,
                    footer_show_social: settings.footer_show_social ?? true,
                    footer_show_categories: settings.footer_show_categories ?? false,
                    footer_show_newsletter: settings.footer_show_newsletter ?? false,
                    footer_newsletter_title: settings.footer_newsletter_title ?? null,
                    footer_newsletter_placeholder: settings.footer_newsletter_placeholder ?? null,
                    footer_newsletter_button_text: settings.footer_newsletter_button_text ?? null,
                    footer_text: settings.footer_text ?? null,
                    show_powered_by: settings.show_powered_by ?? true,
                  }}
                  onUpdate={handleUpdateGlobalSettings}
                />
                <MobileFooterPanel
                  settings={{
                    mobile_footer_style: settings.mobile_footer_style ?? 'accordion',
                    mobile_footer_show_social: settings.mobile_footer_show_social ?? true,
                    mobile_footer_show_hours: settings.mobile_footer_show_hours ?? false,
                  }}
                  onUpdate={handleUpdateGlobalSettings}
                />
                {organizationId && (
                  <MenuGroupManager organizationId={organizationId} />
                )}
              </div>
            ) : null
          }
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
          activeSectionId={activeSectionId}
          onSelectSectionFromCanvas={(sectionId) => setActiveSectionId(sectionId)}
        />
      </div>

      {/* Add Section Dialog */}
      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        existingSectionTypes={currentPage.sections.map((s) => s.section_type)}
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
    </div>
  );
}
