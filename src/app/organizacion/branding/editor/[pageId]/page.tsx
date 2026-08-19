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
  HeaderLayoutSelector,
  HeaderOptionsPanel,
  MobileHeaderPanel,
  MenuTreeEditor,
  HeaderPreviewMockup,
  type DevicePreview,
} from '@/components/organization/branding/editor';

export default function PageEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const pageId = params.pageId as string;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [currentPage, setCurrentPage] = useState<WebsitePageWithSections | null>(null);
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Editor state
  const [devicePreview, setDevicePreview] = useState<DevicePreview>('desktop');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showPageSEO, setShowPageSEO] = useState(false);
  const [showMenuConfig, setShowMenuConfig] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  // Pending changes (batched for save)
  const pendingSectionUpdates = useRef<Map<string, Partial<WebsitePageSection>>>(new Map());
  const pendingSettingsUpdates = useRef<Partial<WebsiteSettings>>({});
  const pendingPageUpdates = useRef<Record<string, string>>({});
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

  // ---- PAGE CHANGE ----
  const handlePageChange = async (newPageId: string) => {
    if (hasChanges) {
      const confirm = window.confirm(
        'Tienes cambios sin guardar. ¿Deseas descartarlos?'
      );
      if (!confirm) return;
    }

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

    setCurrentPage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, content } : s
        ),
      };
    });

    const existing = pendingSectionUpdates.current.get(sectionId) || {};
    pendingSectionUpdates.current.set(sectionId, { ...existing, content });
    setHasChanges(true);
  };

  const handleUpdateSectionVariant = (sectionId: string, variant: string) => {
    if (!currentPage) return;

    setCurrentPage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, section_variant: variant } : s
        ),
      };
    });

    const existing = pendingSectionUpdates.current.get(sectionId) || {};
    pendingSectionUpdates.current.set(sectionId, {
      ...existing,
      section_variant: variant,
    } as any);
    setHasChanges(true);
  };

  const handleToggleVisibility = (sectionId: string, visible: boolean) => {
    if (!currentPage) return;

    setCurrentPage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, is_visible: visible } : s
        ),
      };
    });

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
    const confirm = window.confirm('¿Eliminar esta sección?');
    if (!confirm) return;

    try {
      await websitePageBuilderService.deleteSection(sectionId);
      setCurrentPage((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.filter((s) => s.id !== sectionId),
        };
      });
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
        return {
          ...prev,
          sections: [...prev.sections, newSection],
        };
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

    setCurrentPage((prev) => {
      if (!prev) return prev;
      return { ...prev, sections: newSections };
    });
    setHasChanges(true);
  };

  // ---- PAGE SEO UPDATE ----
  const handleUpdatePageSEO = (updates: { meta_title?: string; meta_description?: string; og_image_url?: string }) => {
    if (!currentPage) return;
    setCurrentPage((prev) => (prev ? { ...prev, ...updates } : prev));
    pendingPageUpdates.current = { ...pendingPageUpdates.current, ...updates };
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
          updatedSettings = await websiteSettingsService.updateHeaderConfig(
            organizationId,
            headerUpdates as any
          );
        }
        if (updatedSettings) setSettings(updatedSettings);
      }

      // 5. Sync gallery/testimonials/FAQ items to website_settings
      const contentSync: Record<string, any> = {};
      for (const section of currentPage.sections) {
        const items = section.content?.items;
        if (!items || !Array.isArray(items)) continue;
        if (section.section_type === 'gallery') {
          contentSync.gallery_images = items;
        } else if (section.section_type === 'testimonials') {
          contentSync.testimonials = items;
        } else if (section.section_type === 'faq') {
          contentSync.faq_items = items;
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
  const currentPreviewUrl = previewUrl
    ? currentPage?.slug === 'home'
      ? previewUrl
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
                  }}
                  onUpdate={handleUpdateGlobalSettings}
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
          organizationId={organizationId}
        />

        {/* Right Preview */}
        <EditorPreview
          previewUrl={currentPreviewUrl}
          devicePreview={devicePreview}
          refreshKey={previewRefreshKey}
        />
      </div>

      {/* Add Section Dialog */}
      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        existingSectionTypes={currentPage.sections.map((s) => s.section_type)}
      />
    </div>
  );
}
