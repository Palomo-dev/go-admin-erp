'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  ImageIcon,
  Plus,
  RefreshCw,
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Loader2,
  Upload,
  Package,
  Globe,
  Lock,
  HardDrive,
  Tag,
  Eye,
} from 'lucide-react';
import { ImagenesService } from './ImagenesService';
import { SharedImage, ImagesStats } from './types';

export function ImagenesPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [imagenes, setImagenes] = useState<SharedImage[]>([]);
  const [stats, setStats] = useState<ImagesStats>({ total: 0, public: 0, private: 0, inUse: 0, totalSize: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroVisibilidad, setFiltroVisibilidad] = useState<'all' | 'public' | 'private'>('all');

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editando, setEditando] = useState<SharedImage | null>(null);
  const [previewImage, setPreviewImage] = useState<SharedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    file_name: '',
    is_public: false,
    tags: [] as string[],
    newTag: '',
  });

  // Delete dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<number | null>(null);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const filters = {
        search: searchTerm || undefined,
        isPublic: filtroVisibilidad === 'all' ? undefined : filtroVisibilidad === 'public',
      };

      const [imagenesData, statsData] = await Promise.all([
        ImagenesService.obtenerImagenes(filters),
        ImagenesService.obtenerStats(),
      ]);

      setImagenes(imagenesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando imágenes:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las imágenes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [searchTerm, filtroVisibilidad, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => loadData(true);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast({ title: 'Error', description: `${file.name} no es una imagen válida`, variant: 'destructive' });
          continue;
        }
        await ImagenesService.subirImagen(file);
      }
      toast({ title: 'Imágenes subidas correctamente' });
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Error al subir imágenes', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openEditModal = (img: SharedImage) => {
    setEditando(img);
    setFormData({
      file_name: img.file_name,
      is_public: img.is_public,
      tags: img.tags || [],
      newTag: '',
    });
    setShowEditModal(true);
  };

  const openPreview = (img: SharedImage) => {
    setPreviewImage(img);
    setShowPreviewModal(true);
  };

  const handleGuardar = async () => {
    if (!editando) return;

    try {
      setSaving(true);
      await ImagenesService.actualizarImagen(editando.id, {
        file_name: formData.file_name,
        is_public: formData.is_public,
        tags: formData.tags,
      });
      toast({ title: 'Imagen actualizada' });
      setShowEditModal(false);
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (formData.newTag.trim() && !formData.tags.includes(formData.newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, prev.newTag.trim()],
        newTag: '',
      }));
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const confirmDelete = (id: number) => {
    setImageToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleEliminar = async () => {
    if (!imageToDelete) return;
    try {
      await ImagenesService.eliminarImagen(imageToDelete);
      toast({ title: 'Imagen eliminada' });
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo eliminar', variant: 'destructive' });
    } finally {
      setShowDeleteConfirm(false);
      setImageToDelete(null);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <ImageIcon className="h-6 w-6 text-blue-600" />
              </div>
              Biblioteca de Imágenes
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Imágenes - Galería reutilizable
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Subir Imágenes
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <ImageIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Globe className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.public}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Públicas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Lock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.private}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Privadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Package className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.inUse}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">En uso</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <HardDrive className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {ImagenesService.formatFileSize(stats.totalSize)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Espacio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y galería */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Galería
            </CardTitle>
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex gap-1">
                <Button
                  variant={filtroVisibilidad === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroVisibilidad('all')}
                  className={filtroVisibilidad === 'all' ? 'bg-blue-600' : ''}
                >
                  Todas
                </Button>
                <Button
                  variant={filtroVisibilidad === 'public' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroVisibilidad('public')}
                  className={filtroVisibilidad === 'public' ? 'bg-blue-600' : ''}
                >
                  <Globe className="h-3 w-3 mr-1" />
                  Públicas
                </Button>
                <Button
                  variant={filtroVisibilidad === 'private' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroVisibilidad('private')}
                  className={filtroVisibilidad === 'private' ? 'bg-blue-600' : ''}
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Privadas
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar imágenes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : imagenes.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay imágenes en la biblioteca</p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="mt-4"
              >
                <Upload className="h-4 w-4 mr-2" />
                Subir primera imagen
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {imagenes.map(img => (
                <div
                  key={img.id}
                  className="group relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden aspect-square"
                >
                  {img.public_url ? (
                    <Image
                      src={img.public_url}
                      alt={img.file_name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 16vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  
                  {/* Overlay con acciones */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openPreview(img)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openEditModal(img)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => confirmDelete(img.id)}
                      disabled={(img.products_count || 0) > 0}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex gap-1">
                    {img.is_public ? (
                      <Badge className="bg-green-500 text-white text-xs">
                        <Globe className="h-3 w-3" />
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-500 text-white text-xs">
                        <Lock className="h-3 w-3" />
                      </Badge>
                    )}
                  </div>
                  {(img.products_count || 0) > 0 && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-blue-500 text-white text-xs">
                        {img.products_count}
                      </Badge>
                    </div>
                  )}

                  {/* Nombre */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-white text-xs truncate">{img.file_name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal editar */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Editar Imagen</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Modificar propiedades de la imagen
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Nombre del archivo</Label>
              <Input
                value={formData.file_name}
                onChange={(e) => setFormData(prev => ({ ...prev, file_name: e.target.value }))}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="dark:text-gray-300">Imagen pública</Label>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Etiquetas</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.newTag}
                  onChange={(e) => setFormData(prev => ({ ...prev, newTag: e.target.value }))}
                  placeholder="Nueva etiqueta"
                  className="dark:bg-gray-900 dark:border-gray-600"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                    <span className="ml-1">×</span>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button onClick={handleGuardar} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal preview */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{previewImage?.file_name}</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
            {previewImage?.public_url && (
              <Image
                src={previewImage.public_url}
                alt={previewImage.file_name}
                fill
                className="object-contain"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{ImagenesService.formatFileSize(previewImage?.file_size || 0)}</span>
            {previewImage?.dimensions && (
              <span>• {previewImage.dimensions.width}x{previewImage.dimensions.height}</span>
            )}
            <span>• {previewImage?.mime_type}</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación eliminar */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">¿Eliminar imagen?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción eliminará la imagen permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminar} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
