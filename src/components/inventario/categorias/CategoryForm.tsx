'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, FolderTree, Search, Link2, Sparkles, Wand2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import categoryService, {
  type Category,
  type CategoryFormData,
  emptyFormData,
  generateSlug,
} from '@/lib/services/categoryService';
import ImageUploader from '@/components/common/ImageUploader';
import IconSelector from '@/components/common/IconSelector';
import ColorPicker from '@/components/common/ColorPicker';

interface CategoryFormProps {
  categoryUuid?: string;
  defaultParentId?: number | null;
}

export default function CategoryForm({ categoryUuid, defaultParentId }: CategoryFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const isEditMode = !!categoryUuid;

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingImg, setGeneratingImg] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState<CategoryFormData>({
    ...emptyFormData,
    parent_id: defaultParentId ?? null,
  });

  useEffect(() => {
    if (organization?.id) {
      loadCategories();
      if (isEditMode && categoryUuid) {
        loadCategory();
      }
    }
  }, [organization?.id, categoryUuid]);

  const loadCategories = async () => {
    if (!organization?.id) return;
    try {
      const data = await categoryService.getAll(organization.id);
      setCategories(isEditMode ? data.filter(c => c.uuid !== categoryUuid) : data);
    } catch {
      // silencioso
    }
  };

  const loadCategory = async () => {
    if (!categoryUuid) return;
    try {
      setLoading(true);
      const cat = await categoryService.getByUuid(categoryUuid);
      setFormData({
        name: cat.name,
        slug: cat.slug,
        parent_id: cat.parent_id,
        rank: cat.rank,
        icon: cat.icon || 'Package',
        color: cat.color || '#3B82F6',
        image_url: cat.image_url || '',
        description: cat.description || '',
        is_active: cat.is_active,
        display_order: cat.display_order,
        meta_title: cat.meta_title || '',
        meta_description: cat.meta_description || '',
        metadata: cat.metadata || {},
      });
    } catch {
      toast({ title: 'Error', description: 'No se pudo cargar la categoría', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (name: string) => {
    const slug = generateSlug(name);
    setFormData(prev => ({
      ...prev,
      name,
      slug,
      meta_title: name,
      meta_description: prev.description || `Categoría: ${name}`,
    }));
  };

  const handleDescriptionChange = (description: string) => {
    setFormData(prev => ({
      ...prev,
      description,
      meta_description: description || `Categoría: ${prev.name}`,
    }));
  };

  const updateField = <K extends keyof CategoryFormData>(key: K, value: CategoryFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'El nombre es requerido', variant: 'destructive' });
      return;
    }
    if (!organization?.id) {
      toast({ title: 'Error', description: 'No se encontró la organización', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);

      // Auto-asignar rank y display_order al crear
      const dataToSave = { ...formData };
      if (!isEditMode) {
        const siblings = categories.filter(c =>
          formData.parent_id ? c.parent_id === formData.parent_id : c.parent_id === null
        );
        const maxOrder = siblings.length > 0
          ? Math.max(...siblings.map(c => c.display_order || 0))
          : 0;
        dataToSave.rank = maxOrder + 1;
        dataToSave.display_order = maxOrder + 1;
      }

      if (isEditMode && categoryUuid) {
        await categoryService.updateByUuid(categoryUuid, dataToSave);
        toast({ title: 'Categoría actualizada', description: `"${formData.name}" guardada correctamente` });
      } else {
        await categoryService.create(organization.id, dataToSave);
        toast({ title: 'Categoría creada', description: `"${formData.name}" creada exitosamente` });
      }

      router.push('/app/inventario/categorias');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const parentIdValue = formData.parent_id?.toString() || 'none';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header centrado */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/app/inventario/categorias" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <FolderTree className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {isEditMode ? 'Editar Categoría' : 'Nueva Categoría'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Modificar información de la categoría' : 'Crear una nueva categoría de productos'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Formulario centrado */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Información básica */}
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-900 dark:text-white">Información básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Nombre <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Ej: Electrónicos, Ropa, Alimentos..."
                  className="dark:bg-gray-800 dark:border-gray-700"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Categoría Padre</Label>
                <Select
                  value={parentIdValue}
                  onValueChange={v => updateField('parent_id', v === 'none' ? null : parseInt(v))}
                >
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectValue placeholder="Sin categoría padre (raíz)" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="none">Sin categoría padre (raíz)</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.parent_id !== null ? `  └ ${cat.name}` : cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-gray-700 dark:text-gray-300">Descripción</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!formData.name.trim()) { toast({ title: 'Escribe un nombre primero', variant: 'destructive' }); return; }
                      setGeneratingDesc(true);
                      try {
                        const res = await fetch('/api/ai-assistant/improve-text', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ productName: formData.name, currentDescription: formData.description || '', type: 'category_description' }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          if (data.improvedText) handleDescriptionChange(data.improvedText);
                          toast({ title: 'Descripción generada' });
                        }
                      } catch { toast({ title: 'Error', description: 'No se pudo generar la descripción.', variant: 'destructive' }); }
                      finally { setGeneratingDesc(false); }
                    }}
                    disabled={generatingDesc || !formData.name.trim()}
                    className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 gap-1"
                  >
                    {generatingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {generatingDesc ? 'Generando...' : 'Generar con IA'}
                  </Button>
                </div>
                <Textarea
                  value={formData.description}
                  onChange={e => handleDescriptionChange(e.target.value)}
                  placeholder="Descripción de la categoría (opcional)"
                  rows={3}
                  className="dark:bg-gray-800 dark:border-gray-700 resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5" /> Slug (URL)
                </Label>
                <Input
                  value={formData.slug}
                  onChange={e => updateField('slug', e.target.value)}
                  placeholder="se-genera-automaticamente"
                  className="dark:bg-gray-800 dark:border-gray-700 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Se genera automáticamente del nombre, pero puedes editarlo manualmente
                </p>
              </div>

              <div className="flex items-center justify-between py-1">
                <Label className="text-gray-700 dark:text-gray-300">Estado</Label>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={v => updateField('is_active', v)}
                  />
                  <span className={`text-sm font-medium ${formData.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {formData.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Apariencia */}
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-900 dark:text-white">Apariencia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorPicker
                  value={formData.color}
                  onChange={color => updateField('color', color)}
                  label="Color"
                />
                <IconSelector
                  value={formData.icon}
                  onChange={icon => updateField('icon', icon)}
                  label="Icono"
                  color={formData.color}
                />
              </div>

              {/* Vista previa icono + color */}
              {formData.icon && (
                <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <div
                    className="flex items-center justify-center w-14 h-14 rounded-xl"
                    style={{ backgroundColor: `${formData.color}20` }}
                  >
                    {(() => {
                      const Icon = (LucideIcons as any)[formData.icon];
                      return Icon ? <Icon className="h-7 w-7" style={{ color: formData.color }} /> : null;
                    })()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Vista Previa</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formData.icon} · {formData.color}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-gray-700 dark:text-gray-300">Imagen de Categoría</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!formData.name.trim()) { toast({ title: 'Escribe un nombre primero', variant: 'destructive' }); return; }
                      setGeneratingImg(true);
                      try {
                        const res = await fetch('/api/ai-assistant/generate-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ productName: formData.name, description: formData.description || `Categoría: ${formData.name}`, organizationId: organization?.id || 0 }),
                        });
                        if (!res.ok) throw new Error('Error generando imagen');
                        const data = await res.json();
                        if (data.imageUrl) {
                          updateField('image_url', data.imageUrl);
                          toast({ title: 'Imagen generada con IA' });
                        }
                      } catch { toast({ title: 'Error', description: 'No se pudo generar la imagen.', variant: 'destructive' }); }
                      finally { setGeneratingImg(false); }
                    }}
                    disabled={generatingImg || !formData.name.trim()}
                    className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 gap-1"
                  >
                    {generatingImg ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    {generatingImg ? 'Generando...' : 'Generar con IA'}
                  </Button>
                </div>
                <ImageUploader
                  currentImageUrl={formData.image_url}
                  onImageUploaded={url => updateField('image_url', url)}
                  onImageRemoved={() => updateField('image_url', '')}
                  bucket="categories"
                  folder="images"
                  label=""
                />
              </div>
            </CardContent>
          </Card>

          {/* SEO */}
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                SEO
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Título SEO</Label>
                <Input
                  value={formData.meta_title}
                  onChange={e => updateField('meta_title', e.target.value)}
                  placeholder="Título para motores de búsqueda"
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Se genera automáticamente del nombre, pero puedes personalizarlo
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Descripción SEO</Label>
                <Textarea
                  value={formData.meta_description}
                  onChange={e => updateField('meta_description', e.target.value)}
                  placeholder="Descripción para motores de búsqueda"
                  rows={3}
                  className="dark:bg-gray-800 dark:border-gray-700 resize-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Se genera automáticamente de la descripción, pero puedes personalizarlo
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="border-gray-300 dark:border-gray-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />{isEditMode ? 'Guardar Cambios' : 'Crear Categoría'}</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
