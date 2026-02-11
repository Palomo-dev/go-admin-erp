'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Palette, Image, LayoutGrid, Zap, Search, FileText, Code, Globe,
  ArrowLeft, RefreshCw, Save
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { 
  websiteSettingsService, 
  WebsiteSettings 
} from '@/lib/services/websiteSettingsService';
import {
  BrandingThemeTab,
  BrandingHeroTab,
  BrandingSectionsTab,
  BrandingFeaturesTab,
  BrandingSEOTab,
  BrandingContentTab,
  BrandingAdvancedTab,
  BrandingPublishTab,
} from '@/components/organization/branding';

const TABS = [
  { id: 'theme', label: 'Tema', icon: Palette },
  { id: 'hero', label: 'Hero', icon: Image },
  { id: 'sections', label: 'Secciones', icon: LayoutGrid },
  { id: 'features', label: 'Funcionalidades', icon: Zap },
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'content', label: 'Contenido', icon: FileText },
  { id: 'advanced', label: 'Avanzado', icon: Code },
  { id: 'publish', label: 'Publicación', icon: Globe },
];

export default function BrandingPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('theme');

  // Cargar configuración
  const loadSettings = useCallback(async () => {
    if (!organizationId) return;

    try {
      let data = await websiteSettingsService.getSettings(organizationId);
      
      // Si no existe, crear configuración inicial
      if (!data) {
        data = await websiteSettingsService.createSettings(organizationId);
        toast({
          title: 'Configuración creada',
          description: 'Se ha creado la configuración inicial del sitio web',
        });
      }
      
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración del sitio',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Refrescar datos
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadSettings();
    setIsRefreshing(false);
  };

  // Guardar cambios por sección
  const handleSave = async (data: Partial<WebsiteSettings>) => {
    if (!organizationId || !settings) return;

    setIsSaving(true);
    try {
      // Determinar qué sección actualizar basado en los datos
      let updatedSettings: WebsiteSettings;

      // Cast necesario: Partial<WebsiteSettings> puede tener null, pero los métodos esperan undefined
      const safeData = data as any;

      if ('template_id' in data || 'theme_mode' in data || 'primary_color' in data) {
        updatedSettings = await websiteSettingsService.updateTheme(organizationId, safeData);
      } else if ('hero_title' in data || 'hero_image_url' in data) {
        updatedSettings = await websiteSettingsService.updateHero(organizationId, safeData);
      } else if ('show_products' in data || 'show_services' in data) {
        updatedSettings = await websiteSettingsService.updateSections(organizationId, safeData);
      } else if ('enable_reservations' in data || 'enable_online_ordering' in data) {
        updatedSettings = await websiteSettingsService.updateFeatures(organizationId, safeData);
      } else if ('meta_title' in data || 'meta_description' in data || 'favicon_url' in data) {
        updatedSettings = await websiteSettingsService.updateSEO(organizationId, safeData);
      } else if ('social_links' in data || 'business_hours' in data || 'gallery_images' in data) {
        updatedSettings = await websiteSettingsService.updateContent(organizationId, safeData);
      } else if ('custom_css' in data || 'custom_scripts' in data || 'analytics_id' in data) {
        updatedSettings = await websiteSettingsService.updateAdvanced(organizationId, safeData);
      } else {
        updatedSettings = await websiteSettingsService.updateTheme(organizationId, safeData);
      }

      setSettings(updatedSettings);
      toast({
        title: 'Guardado',
        description: 'Los cambios se han guardado correctamente',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar los cambios',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Subir imagen
  const handleUploadImage = async (file: File, type: 'favicon' | 'og_image' | 'hero' | 'gallery') => {
    if (!organizationId) throw new Error('No organization ID');
    return await websiteSettingsService.uploadImage(organizationId, file, type);
  };

  // Publicar sitio
  const handlePublish = async () => {
    if (!organizationId) return;

    setIsSaving(true);
    try {
      const updatedSettings = await websiteSettingsService.togglePublish(organizationId, true);
      setSettings(updatedSettings);
      toast({
        title: '¡Sitio publicado!',
        description: 'Tu sitio web ahora está visible para el público',
      });
    } catch (error) {
      console.error('Error publishing:', error);
      toast({
        title: 'Error',
        description: 'No se pudo publicar el sitio',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Despublicar sitio
  const handleUnpublish = async () => {
    if (!organizationId) return;

    setIsSaving(true);
    try {
      const updatedSettings = await websiteSettingsService.togglePublish(organizationId, false);
      setSettings(updatedSettings);
      toast({
        title: 'Sitio despublicado',
        description: 'Tu sitio web ya no es visible para el público',
      });
    } catch (error) {
      console.error('Error unpublishing:', error);
      toast({
        title: 'Error',
        description: 'No se pudo despublicar el sitio',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Restablecer a plantilla
  const handleResetToTemplate = async (templateId: string) => {
    if (!organizationId) return;

    try {
      const updatedSettings = await websiteSettingsService.resetToTemplate(organizationId, templateId);
      setSettings(updatedSettings);
      toast({
        title: 'Plantilla restablecida',
        description: 'Los colores y fuentes se han restablecido',
      });
    } catch (error) {
      console.error('Error resetting template:', error);
      toast({
        title: 'Error',
        description: 'No se pudo restablecer la plantilla',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/app/organizacion/informacion"
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Palette className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Branding & Sitio Web
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Configura el branding y sitio web público de tu organización
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="border-gray-300 dark:border-gray-700"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
                Actualizar
              </Button>
              {settings?.is_published ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-sm">
                  <Globe className="h-4 w-4" />
                  Publicado
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md text-sm">
                  <Globe className="h-4 w-4" />
                  Borrador
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-6">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-10 w-28" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          </div>
        ) : settings ? (
          <div className="p-4 sm:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="flex flex-wrap justify-start gap-1 h-auto p-1 bg-gray-100 dark:bg-gray-800 mb-6">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="theme">
                <BrandingThemeTab
                  settings={settings}
                  onSave={handleSave}
                  isSaving={isSaving}
                />
              </TabsContent>

              <TabsContent value="hero">
                <BrandingHeroTab
                  settings={settings}
                  onSave={handleSave}
                  onUploadImage={handleUploadImage}
                  isSaving={isSaving}
                />
              </TabsContent>

              <TabsContent value="sections">
                <BrandingSectionsTab
                  settings={settings}
                  onSave={handleSave}
                  isSaving={isSaving}
                />
              </TabsContent>

              <TabsContent value="features">
                <BrandingFeaturesTab
                  settings={settings}
                  onSave={handleSave}
                  isSaving={isSaving}
                />
              </TabsContent>

              <TabsContent value="seo">
                <BrandingSEOTab
                  settings={settings}
                  onSave={handleSave}
                  onUploadImage={handleUploadImage}
                  isSaving={isSaving}
                />
              </TabsContent>

              <TabsContent value="content">
                <BrandingContentTab
                  settings={settings}
                  onSave={handleSave}
                  onUploadImage={handleUploadImage}
                  isSaving={isSaving}
                />
              </TabsContent>

              <TabsContent value="advanced">
                <BrandingAdvancedTab
                  settings={settings}
                  onSave={handleSave}
                  isSaving={isSaving}
                />
              </TabsContent>

              <TabsContent value="publish">
                <BrandingPublishTab
                  settings={settings}
                  organizationName={organization?.name || 'Mi Organización'}
                  subdomain={undefined}
                  onPublish={handlePublish}
                  onUnpublish={handleUnpublish}
                  onResetToTemplate={handleResetToTemplate}
                  isPublishing={isSaving}
                />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No se pudo cargar la configuración del sitio
            </p>
            <Button onClick={handleRefresh} className="mt-4">
              Reintentar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
