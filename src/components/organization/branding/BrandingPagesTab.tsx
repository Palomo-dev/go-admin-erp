'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  FileEdit,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  LayoutGrid,
  ExternalLink,
  GripVertical,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  websitePageBuilderService,
  type WebsitePage,
} from '@/lib/services/websitePageBuilderService';

interface BrandingPagesTabProps {
  organizationId: number;
}

export default function BrandingPagesTab({ organizationId }: BrandingPagesTabProps) {
  const router = useRouter();
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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

  const handleCreatePage = async () => {
    if (!newPageTitle.trim() || !newPageSlug.trim()) return;

    setIsCreating(true);
    try {
      await websitePageBuilderService.createPage({
        organization_id: organizationId,
        title: newPageTitle,
        slug: newPageSlug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        show_in_header: true,
        header_order: pages.length,
      });
      setShowCreateDialog(false);
      setNewPageTitle('');
      setNewPageSlug('');
      await loadPages();
    } catch (error) {
      console.error('Error creating page:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    const confirm = window.confirm('¿Eliminar esta página y todas sus secciones?');
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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <LayoutGrid className="h-5 w-5" />
                Páginas del Sitio Web
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                Administra las páginas de tu sitio web. Haz clic en &quot;Editar&quot; para abrir el editor visual tipo Shopify.
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Página
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <div className="text-center py-8">
              <LayoutGrid className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                No hay páginas creadas
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Aplica un template preset o crea páginas manualmente
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
                >
                  <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm dark:text-white truncate">
                        {page.title}
                      </p>
                      <Badge
                        variant={page.is_published ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {page.is_published ? 'Publicada' : 'Borrador'}
                      </Badge>
                      {page.show_in_header && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 dark:border-gray-600">
                          Header
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      /{page.slug}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePublish(page)}
                      className="h-8 w-8 p-0"
                      title={page.is_published ? 'Despublicar' : 'Publicar'}
                    >
                      {page.is_published ? (
                        <Eye className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePage(page.id)}
                      className="h-8 w-8 p-0"
                      title="Eliminar página"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => openEditor(page.id)}
                    className="bg-blue-600 hover:bg-blue-700 shrink-0"
                  >
                    <FileEdit className="h-3.5 w-3.5 mr-1.5" />
                    Editar
                  </Button>
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
            <DialogTitle>Crear nueva página</DialogTitle>
            <DialogDescription>
              Agrega una nueva página a tu sitio web
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título</Label>
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
                placeholder="Ej: Nosotros, Galería, Servicios"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">/</span>
                <Input
                  value={newPageSlug}
                  onChange={(e) => setNewPageSlug(e.target.value)}
                  placeholder="nosotros"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreatePage}
              disabled={isCreating || !newPageTitle.trim() || !newPageSlug.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Página
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
