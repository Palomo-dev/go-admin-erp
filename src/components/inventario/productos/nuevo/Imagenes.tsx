"use client"

import { useState, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Upload, X, Star, Loader2, Wand2 } from 'lucide-react'
import Image from 'next/image'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { useToast } from '@/components/ui/use-toast'

interface ImagenesProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

export default function Imagenes({ formData, updateFormData }: ImagenesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const { organization } = useOrganization()
  const { toast } = useToast()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newImages = files.map((file, index) => ({
      file,
      url: URL.createObjectURL(file),
      is_primary: formData.images.length === 0 && index === 0
    }))

    updateFormData('images', [...formData.images, ...newImages])
  }

  const removeImage = (index: number) => {
    const newImages = formData.images.filter((_: any, i: number) => i !== index)
    if (newImages.length > 0 && !newImages.some((img: any) => img.is_primary)) {
      newImages[0].is_primary = true
    }
    updateFormData('images', newImages)
  }

  const setPrimaryImage = (index: number) => {
    const newImages = formData.images.map((img: any, i: number) => ({
      ...img,
      is_primary: i === index
    }))
    updateFormData('images', newImages)
  }

  const handleGenerateImage = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Escribe un nombre primero', description: 'La IA necesita el nombre del producto para generar la imagen.', variant: 'destructive' })
      return
    }

    setIsGeneratingImage(true)
    try {
      const response = await fetch('/api/ai-assistant/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: formData.name,
          description: formData.description || '',
          organizationId: organization?.id || 0
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Error generando imagen')
      }

      const data = await response.json()
      if (data.imageUrl) {
        const imgRes = await fetch(data.imageUrl)
        const blob = await imgRes.blob()
        const file = new File([blob], `ai-${Date.now()}.png`, { type: 'image/png' })
        const newImage = {
          file,
          url: URL.createObjectURL(file),
          is_primary: formData.images.length === 0
        }
        updateFormData('images', [...formData.images, newImage])
        toast({ title: 'Imagen generada con IA', description: 'Puedes cambiarla o agregar más imágenes.' })
      }
    } catch (error: any) {
      console.error('Error generando imagen:', error)
      toast({ title: 'Error', description: error.message || 'No se pudo generar la imagen con IA.', variant: 'destructive' })
    } finally {
      setIsGeneratingImage(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-100 dark:bg-pink-900/20 rounded-lg">
            <ImageIcon className="h-5 w-5 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Imágenes del Producto
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Hasta 5 imágenes (máx. 5MB cada una)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleGenerateImage}
            disabled={isGeneratingImage || !formData.name.trim()}
            variant="outline"
            size="sm"
            className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
          >
            {isGeneratingImage ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generar con IA
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={formData.images.length >= 5}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            <Upload className="h-4 w-4 mr-2" />
            Subir Imágenes
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {formData.images.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
          <ImageIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No hay imágenes cargadas
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              onClick={handleGenerateImage}
              disabled={!formData.name.trim()}
              variant="outline"
              size="sm"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Generar con IA
            </Button>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Subir Imágenes
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {formData.images.map((image: any, index: number) => (
            <div
              key={index}
              className="relative group aspect-square border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              <Image
                src={image.url}
                alt={`Imagen ${index + 1}`}
                fill
                className="object-cover"
              />
              
              {/* Overlay con acciones */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setPrimaryImage(index)}
                  className="h-8 w-8 bg-white/90 hover:bg-white text-yellow-600"
                  title="Establecer como principal"
                >
                  <Star className={`h-4 w-4 ${image.is_primary ? 'fill-current' : ''}`} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeImage(index)}
                  className="h-8 w-8 bg-white/90 hover:bg-white text-red-600"
                  title="Eliminar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Badge de imagen principal */}
              {image.is_primary && (
                <div className="absolute top-2 left-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  Principal
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Información adicional */}
      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Nota:</strong> La primera imagen o la marcada como principal será la que se muestre en las listas de productos.
        </p>
      </div>
    </div>
  )
}
