'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Loader2,
  FileEdit,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  LayoutGrid,
  GripVertical,
  ShoppingBag,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  websitePageBuilderService,
  type WebsitePage,
} from '@/lib/services/websitePageBuilderService';

interface BrandingPagesTabProps {
  organizationId: number;
  typeId?: number;
}

export default function BrandingPagesTab({ organizationId, typeId }: BrandingPagesTabProps) {
  const router = useRouter();
  const t = useTranslations('branding.pages');
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');
  const [newPageLocation, setNewPageLocation] = useState<'header' | 'footer' | 'both' | 'none'>('header');
  const [isCreating, setIsCreating] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    loadPages();
  }, [organizationId]);

  const loadPages = async () => {
    try {
      setIsLoading(true);
      const data = await websitePageBuilderService.getPages(organizationId);
      setPages(data);
    } catch (error) {
      console.error('Error loading pages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedDefaultPages = async () => {
    setIsSeeding(true);
    try {
      await websitePageBuilderService.seedDefaultPages(organizationId, typeId);
      await loadPages();
    } catch (error) {
      console.error('Error seeding default pages:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCreatePage = async () => {
    if (!newPageTitle.trim() || !newPageSlug.trim()) return;

    setIsCreating(true);
    try {
      const showInHeader = newPageLocation === 'header' || newPageLocation === 'both';
      const showInFooter = newPageLocation === 'footer' || newPageLocation === 'both';
      const footerCount = pages.filter(p => p.show_in_footer).length;

      await websitePageBuilderService.createPage({
        organization_id: organizationId,
        title: newPageTitle,
        slug: newPageSlug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        show_in_header: showInHeader,
        show_in_footer: showInFooter,
        header_order: showInHeader ? pages.filter(p => p.show_in_header).length : 0,
        footer_order: showInFooter ? footerCount : 0,
      });
      setShowCreateDialog(false);
      setNewPageTitle('');
      setNewPageSlug('');
      setNewPageLocation('header');
      await loadPages();
    } catch (error) {
      console.error('Error creating page:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    const confirm = window.confirm(t('deleteConfirm'));
    if (!confirm) return;

    try {
      await websitePageBuilderService.deletePage(pageId);
      await loadPages();
    } catch (error) {
      console.error('Error deleting page:', error);
    }
  };

  const handleTogglePublish = async (page: WebsitePage) => {
    try {
      await websitePageBuilderService.updatePage(page.id, {
        is_published: !page.is_published,
      });
      await loadPages();
    } catch (error) {
      console.error('Error toggling publish:', error);
    }
  };

  const openEditor = (pageId: string) => {
    router.push(`/organizacion/branding/editor/${pageId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
              <Skeleton className="h-9 w-full sm:w-32" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <LayoutGrid className="h-5 w-5 shrink-0" />
                {t('title')}
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                {t('description')}
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('newPage')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <div className="text-center py-8">
              <LayoutGrid className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                {t('noPages')}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                {t('noPagesHint')}
              </p>
              <Button
                onClick={handleSeedDefaultPages}
                disabled={isSeeding}
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                {isSeeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingBag className="h-4 w-4 mr-2" />}
                Generar páginas por defecto
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
                >
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm dark:text-white min-w-0 break-words">
                          {page.title}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant={page.is_published ? 'default' : 'secondary'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {page.is_published ? t('published') : t('draft')}
                          </Badge>
                          {page.show_in_header && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 dark:border-gray-600">
                              {t('header')}
                            </Badge>
                          )}
                          {page.show_in_footer && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 dark:border-gray-600">
                              {t('footer')}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        /{page.slug}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 w-full sm:w-auto shrink-0">
                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTogglePublish(page)}
                        className="h-8 w-8 p-0"
                        title={page.is_published ? t('unpublish') : t('publish')}
                      >
                        {page.is_published ? (
                          <Eye className="h-3.5 w-3.5 text-green-600 dark:text-green-300" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePage(page.id)}
                        className="h-8 w-8 p-0"
                        title={t('deletePage')}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400 dark:text-red-500" />
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => openEditor(page.id)}
                      className="bg-blue-600 hover:bg-blue-700 shrink-0"
                    >
                      <FileEdit className="h-3.5 w-3.5 mr-1.5" />
                      {t('edit')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Page Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
            <DialogDescription>
              {t('createDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('titleLabel')}</Label>
              <Input
                value={newPageTitle}
                onChange={(e) => {
                  setNewPageTitle(e.target.value);
                  setNewPageSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/\s+/g, '-')
                      .replace(/[^a-z0-9-]/g, '')
                  );
                }}
                placeholder={t('titlePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('slugLabel')}</Label>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">/</span>
                <Input
                  value={newPageSlug}
                  onChange={(e) => setNewPageSlug(e.target.value)}
                  placeholder={t('slugPlaceholder')}
                  className="min-w-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('locationLabel')}</Label>
              <RadioGroup
                value={newPageLocation}
                onValueChange={(value) => setNewPageLocation(value as 'header' | 'footer' | 'both' | 'none')}
                className="grid grid-cols-2 gap-2"
              >
                <label htmlFor="loc-header" className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <RadioGroupItem id="loc-header" value="header" />
                  <span className="text-sm dark:text-gray-200">{t('locationHeader')}</span>
                </label>
                <label htmlFor="loc-footer" className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <RadioGroupItem id="loc-footer" value="footer" />
                  <span className="text-sm dark:text-gray-200">{t('locationFooter')}</span>
                </label>
                <label htmlFor="loc-both" className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <RadioGroupItem id="loc-both" value="both" />
                  <span className="text-sm dark:text-gray-200">{t('locationBoth')}</span>
                </label>
                <label htmlFor="loc-none" className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <RadioGroupItem id="loc-none" value="none" />
                  <span className="text-sm dark:text-gray-200">{t('locationNone')}</span>
                </label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCreatePage}
              disabled={isCreating || !newPageTitle.trim() || !newPageSlug.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
