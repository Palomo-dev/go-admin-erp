'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Loader2, FolderTree } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { useToast } from '@/components/ui/use-toast'
import { Categoria } from '../types'
import ImageUploader from '@/components/common/ImageUploader'
import IconSelector from '@/components/common/IconSelector'
import ColorPicker from '@/components/common/ColorPicker'

export function NuevaCategoriaForm() {
  const router = useRouter()
  const { toast } = useToast()
  const { organization } = useOrganization()
  const [loading, setLoading] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    parent_id: '',
    rank: 0,
    
    // Campos nuevos
    icon: 'Package',
    color: '#6366f1',
    image_url: '',
    description: '',
    is_active: true,
    display_order: 0,
    meta_title: '',
    meta_description: ''
  })

  useEffect(() => {
    if (organization?.id) {
      cargarCategorias()
    }
  }, [organization?.id])

  const cargarCategorias = async () => {
    if (!organization?.id) return

    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('organization_id', organization.id)
      .order('name')
    
    setCategorias(data || [])
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: generateSlug(name)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre es requerido',
        variant: 'destructive'
      })
      return
    }

    if (!organization?.id) {
      toast({
        title: 'Error',
        description: 'No se encontró la organización',
        variant: 'destructive'
      })
      return
    }

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('categories')
        .insert({
          organization_id: organization.id,
          name: formData.name.trim(),
          slug: formData.slug || generateSlug(formData.name),
          parent_id: formData.parent_id && formData.parent_id !== 'none' ? parseInt(formData.parent_id) : null,
          rank: formData.rank,
          
          // Campos nuevos
          icon: formData.icon,
          color: formData.color,
          image_url: formData.image_url || null,
          description: formData.description || null,
          is_active: formData.is_active,
          display_order: formData.display_order,
          meta_title: formData.meta_title || null,
          meta_description: formData.meta_description || null
        })
        .select()
        .single()

      if (error) throw error

      toast({
        title: '✅ Categoría creada',
        description: `La categoría "${formData.name}" ha sido creada exitosamente`
      })

      router.push('/app/inventario/categorias')
    } catch (error) {
      console.error('Error creando categoría:', error)
      toast({
        title: 'Error',
        description: 'No se pudo crear la categoría',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4">
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

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Información de la Categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <Tabs defaultValue="basico" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basico">Básico</TabsTrigger>
                <TabsTrigger value="visual">Visual</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
              </TabsList>

              {/* Tab Básico */}
              <TabsContent value="basico" className="space-y-4 mt-4">
                {/* Nombre */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
                    Nombre <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Ej: Electrónicos, Ropa, Alimentos..."
                    className="dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                    required
                  />
                </div>

                {/* Slug */}
                <div className="space-y-2">
                  <Label htmlFor="slug" className="text-gray-700 dark:text-gray-300">
                    Slug (URL)
                  </Label>
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

                {/* Categoría Padre */}
                <div className="space-y-2">
                  <Label htmlFor="parent" className="text-gray-700 dark:text-gray-300">
                    Categoría Padre
                  </Label>
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

                {/* Descripción */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">
                    Descripción
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción detallada de la categoría"
                    rows={4}
                    className="dark:bg-gray-900 dark:border-gray-600 dark:text-white resize-none"
                  />
                </div>

                {/* Orden y Estado */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="display_order" className="text-gray-700 dark:text-gray-300">
                      Orden de Visualización
                    </Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                      className="dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-700 dark:text-gray-300">
                      Estado
                    </Label>
                    <div className="flex items-center gap-3 h-10">
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formData.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab Visual */}
              <TabsContent value="visual" className="space-y-4 mt-4">
                <IconSelector
                  value={formData.icon}
                  onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
                  label="Icono"
                />

                <ColorPicker
                  value={formData.color}
                  onChange={(color) => setFormData(prev => ({ ...prev, color }))}
                  label="Color"
                />

                <ImageUploader
                  currentImageUrl={formData.image_url}
                  onImageUploaded={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                  onImageRemoved={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                  bucket="categories"
                  folder="images"
                  label="Imagen de Categoría"
                />
              </TabsContent>

              {/* Tab SEO */}
              <TabsContent value="seo" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="meta_title" className="text-gray-700 dark:text-gray-300">
                    Título Meta (SEO)
                  </Label>
                  <Input
                    id="meta_title"
                    value={formData.meta_title}
                    onChange={(e) => setFormData(prev => ({ ...prev, meta_title: e.target.value }))}
                    placeholder="Título para motores de búsqueda"
                    className="dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Recomendado: 50-60 caracteres
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_description" className="text-gray-700 dark:text-gray-300">
                    Descripción Meta (SEO)
                  </Label>
                  <Textarea
                    id="meta_description"
                    value={formData.meta_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                    placeholder="Descripción para motores de búsqueda"
                    rows={4}
                    className="dark:bg-gray-900 dark:border-gray-600 dark:text-white resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Recomendado: 150-160 caracteres
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Botones */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
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
  )
}
