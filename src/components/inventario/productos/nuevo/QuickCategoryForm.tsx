'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Loader2 } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import categoryService, {
  type Category,
  type CategoryFormData,
  emptyFormData,
  generateSlug,
} from '@/lib/services/categoryService';
import { STATION_LABELS, type PrinterStation } from '@/components/pos/configuracion/printersService';

interface QuickCategoryFormProps {
  /** Se llama al crear exitosamente la categoría, con la categoría creada */
  onSuccess: (category: Category) => void;
  /** Callback para el botón cancelar */
  onCancel: () => void;
}

/**
 * Formulario embebido para crear una categoría rápidamente desde el diálogo
 * de nuevo producto. Reutiliza el mismo `categoryService` y los mismos campos
 * básicos que `CategoryForm` (nombre, padre, descripción, estación, estado,
 * apariencia), pero sin header ni navegación.
 */
export function QuickCategoryForm({ onSuccess, onCancel }: QuickCategoryFormProps) {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState<CategoryFormData>({ ...emptyFormData });

  useEffect(() => {
    if (organization?.id) {
      loadCategories();
    }
  }, [organization?.id]);

  const loadCategories = async () => {
    if (!organization?.id) return;
    try {
      const data = await categoryService.getAll(organization.id);
      setCategories(data);
    } catch {
      // silencioso
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
      const siblings = categories.filter(c =>
        formData.parent_id ? c.parent_id === formData.parent_id : c.parent_id === null
      );
      const maxOrder = siblings.length > 0
        ? Math.max(...siblings.map(c => c.display_order || 0))
        : 0;
      const dataToSave = {
        ...formData,
        rank: maxOrder + 1,
        display_order: maxOrder + 1,
      };

      const created = await categoryService.create(organization.id, dataToSave);
      toast({ title: 'Categoría creada', description: `"${formData.name}" creada exitosamente` });
      onSuccess(created);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const parentIdValue = formData.parent_id?.toString() || 'none';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label className="text-gray-700 dark:text-gray-300">Descripción</Label>
            <Input
              value={formData.description}
              onChange={e => {
                const description = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  description,
                  meta_description: description || `Categoría: ${prev.name}`,
                }));
              }}
              placeholder="Descripción de la categoría (opcional)"
              className="dark:bg-gray-800 dark:border-gray-700"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Estación de Cocina/Bar</Label>
            <Select
              value={formData.station || 'none'}
              onValueChange={v => updateField('station', v === 'none' ? null : (v as PrinterStation))}
            >
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                <SelectValue placeholder="Sin estación asignada" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="none">Sin estación asignada</SelectItem>
                {Object.entries(STATION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Requiere preparación</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Los productos de esta categoría generarán tickets de cocina
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.requires_preparation}
                onCheckedChange={v => updateField('requires_preparation', v)}
              />
              <span className={`text-sm font-medium ${formData.requires_preparation ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {formData.requires_preparation ? 'Sí' : 'No'}
              </span>
            </div>
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

      {/* Botones */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
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
            <><Save className="h-4 w-4 mr-2" />Crear Categoría</>
          )}
        </Button>
      </div>
    </form>
  );
}
