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

export function NuevaCategoriaForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    parent_id: '',
    rank: 0
  });

  useEffect(() => {
    cargarCategorias();
  }, []);

  const cargarCategorias = async () => {
    const organizationId = getOrganizationId();
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');
    
    setCategorias(data || []);
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
      setLoading(true);
      const organizationId = getOrganizationId();

      const { data, error } = await supabase
        .from('categories')
        .insert({
          organization_id: organizationId,
          name: formData.name.trim(),
          slug: formData.slug || generateSlug(formData.name),
          parent_id: formData.parent_id && formData.parent_id !== 'none' ? parseInt(formData.parent_id) : null,
          rank: formData.rank
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Categoría creada',
        description: `La categoría "${formData.name}" ha sido creada exitosamente`
      });

      router.push('/app/inventario/categorias');
    } catch (error) {
      console.error('Error creando categoría:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la categoría',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

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
              Nueva Categoría
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Crear una nueva categoría de productos
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
                  placeholder="se-genera-automaticamente"
                  className="dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Se genera automáticamente del nombre
                </p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Número menor = aparece primero
                </p>
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
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Crear Categoría
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
