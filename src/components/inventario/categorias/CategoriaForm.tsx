"use client"

import React, { useState, useEffect } from 'react'
import { Categoria } from './types'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ImageUploader from '@/components/common/ImageUploader'
import IconSelector from '@/components/common/IconSelector'
import ColorPicker from '@/components/common/ColorPicker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface CategoriaFormProps {
  categoria?: Categoria
  categoriasPadre: Categoria[]
  onSubmit: (categoria: Partial<Categoria>) => void
  onCancel: () => void
}

const CategoriaForm: React.FC<CategoriaFormProps> = ({
  categoria,
  categoriasPadre,
  onSubmit,
  onCancel
}) => {
  const [formData, setFormData] = useState<{
    name: string
    parent_id: string
    icon: string
    color: string
    image_url: string
    description: string
    is_active: boolean
    display_order: number
    meta_title: string
    meta_description: string
  }>({
    name: '',
    parent_id: 'null',
    icon: 'Package',
    color: '#6366f1',
    image_url: '',
    description: '',
    is_active: true,
    display_order: 0,
    meta_title: '',
    meta_description: ''
  })
  
  const [errors, setErrors] = useState<{
    name?: string
  }>({})
  
  useEffect(() => {
    if (categoria) {
      setFormData({
        name: categoria.name,
        parent_id: categoria.parent_id ? categoria.parent_id.toString() : 'null',
        icon: (categoria as any).icon || 'Package',
        color: (categoria as any).color || '#6366f1',
        image_url: (categoria as any).image_url || '',
        description: (categoria as any).description || '',
        is_active: (categoria as any).is_active !== undefined ? (categoria as any).is_active : true,
        display_order: (categoria as any).display_order || 0,
        meta_title: (categoria as any).meta_title || '',
        meta_description: (categoria as any).meta_description || ''
      })
    }
  }, [categoria])
  
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }))
    }
  }
  
  const handleSelectChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      parent_id: value
    }))
  }
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const newErrors: {name?: string} = {}
    
    if (!formData.name.trim()) {
      newErrors.name = "El nombre es obligatorio"
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    
    onSubmit({
      ...categoria,
      name: formData.name.trim(),
      parent_id: formData.parent_id && formData.parent_id !== 'null' ? parseInt(formData.parent_id) : null,
      icon: formData.icon,
      color: formData.color,
      image_url: formData.image_url || null,
      description: formData.description || null,
      is_active: formData.is_active,
      display_order: formData.display_order,
      meta_title: formData.meta_title || null,
      meta_description: formData.meta_description || null
    } as any)
  }

  return (
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
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Nombre de la categoría"
              className={`border-gray-300 dark:border-gray-700 dark:bg-gray-800 ${
                errors.name ? "border-red-400" : ""
              }`}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Categoría Padre */}
          <div className="space-y-2">
            <Label htmlFor="parent_id" className="text-gray-700 dark:text-gray-300">
              Categoría Padre
            </Label>
            <Select value={formData.parent_id} onValueChange={handleSelectChange}>
              <SelectTrigger className="border-gray-300 dark:border-gray-700 dark:bg-gray-800">
                <SelectValue placeholder="Sin categoría padre (categoría raíz)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">Sin categoría padre (categoría raíz)</SelectItem>
                {categoriasPadre.map(cat => (
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
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Descripción detallada de la categoría"
              rows={4}
              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 resize-none"
            />
          </div>

          {/* Estado y Orden */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_order" className="text-gray-700 dark:text-gray-300">
                Orden de Visualización
              </Label>
              <Input
                id="display_order"
                name="display_order"
                type="number"
                value={formData.display_order}
                onChange={handleChange}
                className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_active" className="text-gray-700 dark:text-gray-300">
                Estado
              </Label>
              <div className="flex items-center gap-3 h-10">
                <Switch
                  id="is_active"
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
          {/* Icono */}
          <IconSelector
            value={formData.icon}
            onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
            label="Icono"
          />

          {/* Color */}
          <ColorPicker
            value={formData.color}
            onChange={(color) => setFormData(prev => ({ ...prev, color }))}
            label="Color"
          />

          {/* Imagen */}
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
          {/* Meta Title */}
          <div className="space-y-2">
            <Label htmlFor="meta_title" className="text-gray-700 dark:text-gray-300">
              Título Meta (SEO)
            </Label>
            <Input
              id="meta_title"
              name="meta_title"
              value={formData.meta_title}
              onChange={handleChange}
              placeholder="Título para motores de búsqueda"
              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Recomendado: 50-60 caracteres
            </p>
          </div>

          {/* Meta Description */}
          <div className="space-y-2">
            <Label htmlFor="meta_description" className="text-gray-700 dark:text-gray-300">
              Descripción Meta (SEO)
            </Label>
            <Textarea
              id="meta_description"
              name="meta_description"
              value={formData.meta_description}
              onChange={handleChange}
              placeholder="Descripción para motores de búsqueda"
              rows={4}
              className="border-gray-300 dark:border-gray-700 dark:bg-gray-800 resize-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Recomendado: 150-160 caracteres
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Botones de acción */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
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
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {categoria ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  )
}

export default CategoriaForm
