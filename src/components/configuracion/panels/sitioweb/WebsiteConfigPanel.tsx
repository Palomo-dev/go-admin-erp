'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Palette, Search, FileText, Code, Globe,
  RefreshCw, FileEdit, ShoppingCart,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { useTranslations } from 'next-intl';
import {
  websiteSettingsService,
  WebsiteSettings,
} from '@/lib/services/websiteSettingsService';

const BrandingThemeTab = dynamic(() => import('@/components/organization/branding/BrandingThemeTab'), {
  loading: () => <Skeleton className="h-96 rounded-xl" />,
});
const BrandingPagesTab = dynamic(() => import('@/components/organization/branding/BrandingPagesTab'), {
  loading: () => <Skeleton className="h-96 rounded-xl" />,
});
const BrandingCheckoutTab = dynamic(() => import('@/components/organization/branding/BrandingCheckoutTab'), {
  loading: () => <Skeleton className="h-96 rounded-xl" />,
});
const BrandingSEOTab = dynamic(() => import('@/components/organization/branding/BrandingSEOTab'), {
  loading: () => <Skeleton className="h-96 rounded-xl" />,
});
const BrandingContentTab = dynamic(() => import('@/components/organization/branding/BrandingContentTab'), {
  loading: () => <Skeleton className="h-96 rounded-xl" />,
});
const BrandingAdvancedTab = dynamic(() => import('@/components/organization/branding/BrandingAdvancedTab'), {
  loading: () => <Skeleton className="h-96 rounded-xl" />,
});
const BrandingPublishTab = dynamic(() => import('@/components/organization/branding/BrandingPublishTab'), {
  loading: () => <Skeleton className="h-96 rounded-xl" />,
});

const TABS = [
  { id: 'theme', label: 'Tema', icon: Palette },
  { id: 'pages', label: 'Páginas', icon: FileEdit },
  { id: 'checkout', label: 'Checkout', icon: ShoppingCart },
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'content', label: 'Contenido', icon: FileText },
  { id: 'advanced', label: 'Avanzado', icon: Code },
  { id: 'publish', label: 'Publicar', icon: Globe },
] as const;

export function WebsiteConfigPanel() {
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

  const loadSettings = useCallback(async () => {
    if (!organizationId) return;

    try {
      let data = await websiteSettingsService.getSettings(organizationId);

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadSettings();
    setIsRefreshing(false);
  };

  const handleSave = async (data: Partial<WebsiteSettings>) => {
    if (!organizationId || !settings) return;

    setIsSaving(true);
    try {
      let updatedSettings: WebsiteSettings;
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

  const handleUploadImage = async (file: File, type: 'favicon' | 'og_image' | 'hero' | 'gallery') => {
    if (!organizationId) throw new Error('No organization ID');
    return await websiteSettingsService.uploadImage(organizationId, file, type);
  };

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 border-b pb-2">
          {TABS.map((tab) => (
            <div key={tab.id} className="h-10 w-28 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('errorLoadingConfigEmpty')}</p>
        <Button onClick={handleRefresh} className="mt-4">
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de acciones */}
      <div className="flex items-center justify-end gap-2">
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
        {settings.is_published ? (
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b pb-2">
          <TabsList className="bg-transparent h-auto p-0 gap-1 flex flex-wrap">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
                >
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
                    <Icon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
                  </div>
                  <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">
                    {tab.label}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="theme" className="mt-6">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <BrandingThemeTab
              settings={settings}
              onSave={handleSave}
              isSaving={isSaving}
              organizationTypeId={organization?.type_id ?? null}
              organizationId={organizationId ?? null}
              subdomain={organization?.subdomain ?? null}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="pages" className="mt-6">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            {organizationId && (
              <BrandingPagesTab organizationId={organizationId} typeId={organization?.type_id} />
            )}
          </Suspense>
        </TabsContent>

        <TabsContent value="checkout" className="mt-6">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <BrandingCheckoutTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="seo" className="mt-6">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <BrandingSEOTab
              settings={settings}
              onSave={handleSave}
              onUploadImage={handleUploadImage}
              isSaving={isSaving}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="content" className="mt-6">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <BrandingContentTab
              settings={settings}
              onSave={handleSave}
              onUploadImage={handleUploadImage}
              isSaving={isSaving}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="advanced" className="mt-6">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <BrandingAdvancedTab
              settings={settings}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="publish" className="mt-6">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <BrandingPublishTab
              settings={settings}
              organizationName={organization?.name || t('myOrganization')}
              subdomain={currentSubdomain || undefined}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              onResetToTemplate={handleResetToTemplate}
              isPublishing={isSaving}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
