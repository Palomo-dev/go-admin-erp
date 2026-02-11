'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, FolderTree } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Categoria } from '../types';

interface EditarCategoriaFormProps {
  categoriaUuid: string;
}

export function EditarCategoriaForm({ categoriaUuid }: EditarCategoriaFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    parent_id: '',
    rank: 0
  });

  useEffect(() => {
    cargarDatos();
  }, [categoriaUuid]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const organizationId = getOrganizationId();

      // Cargar categoría actual
      const { data: categoria, error } = await supabase
        .from('categories')
        .select('*')
        .eq('uuid', categoriaUuid)
        .single();

      if (error) throw error;

      setFormData({
        name: categoria.name,
        slug: categoria.slug,
        parent_id: categoria.parent_id?.toString() || 'none',
        rank: categoria.rank
      });

      // Cargar otras categorías para el select de padre
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('organization_id', organizationId)
        .neq('uuid', categoriaUuid) // Excluir la categoría actual
        .order('name');

      setCategorias(cats || []);
    } catch (error) {
      console.error('Error cargando categoría:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la categoría',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: generateSlug(name)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre es requerido',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('categories')
        .update({
          name: formData.name.trim(),
          slug: formData.slug || generateSlug(formData.name),
          parent_id: formData.parent_id && formData.parent_id !== 'none' ? parseInt(formData.parent_id) : null,
          rank: formData.rank,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', categoriaUuid);

      if (error) throw error;

      toast({
        title: 'Categoría actualizada',
        description: `La categoría "${formData.name}" ha sido actualizada`
      });

      router.push('/app/inventario/categorias');
    } catch (error) {
      console.error('Error actualizando categoría:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la categoría',
        variant: 'destructive'
      });
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

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-2xl flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <FolderTree className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              Editar Categoría
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Modificar información de la categoría
            </p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl">
        <Card className="dark:bg-gray-800/60 dark:border-gray-700/50 bg-white/80 backdrop-blur-sm shadow-lg">
          <CardHeader>
            <CardTitle className="dark:text-white">Información de la Categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="dark:text-gray-300">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ej: Electrónicos, Ropa, Alimentos..."
                  className="dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" className="dark:text-gray-300">Slug (URL)</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  className="dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent" className="dark:text-gray-300">Categoría Padre</Label>
                <Select
                  value={formData.parent_id}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, parent_id: v }))}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600 dark:text-white">
                    <SelectValue placeholder="Sin categoría padre (raíz)" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                    <SelectItem value="none">Sin categoría padre</SelectItem>
                    {categorias.map(cat => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rank" className="dark:text-gray-300">Orden</Label>
                <Input
                  id="rank"
                  type="number"
                  value={formData.rank}
                  onChange={(e) => setFormData(prev => ({ ...prev, rank: parseInt(e.target.value) || 0 }))}
                  className="dark:bg-gray-900 dark:border-gray-600 dark:text-white w-32"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="dark:border-gray-600 dark:text-gray-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
