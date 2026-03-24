'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Palette, Search, FileText, Code, Globe,
  ArrowLeft, RefreshCw, Save, FileEdit
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { useTranslations } from 'next-intl';
import { 
  websiteSettingsService, 
  WebsiteSettings 
} from '@/lib/services/websiteSettingsService';
import {
  BrandingThemeTab,
  BrandingSEOTab,
  BrandingContentTab,
  BrandingAdvancedTab,
  BrandingPublishTab,
  BrandingPagesTab,
} from '@/components/organization/branding';

const TAB_IDS = ['theme', 'pages', 'seo', 'content', 'advanced', 'publish'] as const;
const TAB_ICONS: Record<string, any> = {
  theme: Palette,
  pages: FileEdit,
  seo: Search,
  content: FileText,
  advanced: Code,
  publish: Globe,
};

export default function BrandingPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const t = useTranslations('org.branding');

  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('theme');
  const [currentSubdomain, setCurrentSubdomain] = useState<string | null>(null);

  // Cargar subdominio de la organización directamente desde la DB
  const loadSubdomain = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data } = await supabase
        .from('organizations')
        .select('subdomain')
        .eq('id', organizationId)
        .single();
      setCurrentSubdomain(data?.subdomain || null);
    } catch (error) {
      console.error('Error loading subdomain:', error);
    }
  }, [organizationId]);

  // Cargar configuración
  const loadSettings = useCallback(async () => {
    if (!organizationId) return;

    try {
      let data = await websiteSettingsService.getSettings(organizationId);
      
      // Si no existe, crear configuración inicial
      if (!data) {
        data = await websiteSettingsService.createSettings(organizationId);
        toast({
          title: t('configCreated'),
          description: t('configCreatedDesc'),
        });
      }
      
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Error',
        description: t('errorLoadingConfig'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadSettings();
    loadSubdomain();
  }, [loadSettings, loadSubdomain]);

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
        title: t('saved'),
        description: t('savedDesc'),
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: t('errorSaving'),
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
        title: t('sitePublished'),
        description: t('sitePublishedDesc'),
      });
    } catch (error) {
      console.error('Error publishing:', error);
      toast({
        title: 'Error',
        description: t('errorPublishing'),
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
        title: t('siteUnpublished'),
        description: t('siteUnpublishedDesc'),
      });
    } catch (error) {
      console.error('Error unpublishing:', error);
      toast({
        title: 'Error',
        description: t('errorUnpublishing'),
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
        title: t('templateReset'),
        description: t('templateResetDesc'),
      });
    } catch (error) {
      console.error('Error resetting template:', error);
      toast({
        title: 'Error',
        description: t('errorResettingTemplate'),
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
                  {t('title')}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('description')}
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
                {t('refresh')}
              </Button>
              {settings?.is_published ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-sm">
                  <Globe className="h-4 w-4" />
                  {t('published')}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md text-sm">
                  <Globe className="h-4 w-4" />
                  {t('draft')}
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
                {TAB_IDS.map((tabId) => {
                  const Icon = TAB_ICONS[tabId];
                  return (
                    <TabsTrigger
                      key={tabId}
                      value={tabId}
                      className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{t(`tabs.${tabId}`)}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="pages">
                {organizationId && (
                  <BrandingPagesTab organizationId={organizationId} />
                )}
              </TabsContent>

              <TabsContent value="theme">
                <BrandingThemeTab
                  settings={settings}
                  onSave={handleSave}
                  isSaving={isSaving}
                  organizationTypeId={organization?.type_id ?? null}
                  organizationId={organizationId ?? null}
                  subdomain={organization?.subdomain ?? null}
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
                  organizationName={organization?.name || t('myOrganization')}
                  subdomain={currentSubdomain || undefined}
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
              {t('errorLoadingConfigEmpty')}
            </p>
            <Button onClick={handleRefresh} className="mt-4">
              {t('retry')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
