"use client"

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import Image from 'next/image'

interface ImageUploaderProps {
  currentImageUrl?: string | null
  onImageUploaded: (url: string) => void
  onImageRemoved?: () => void
  bucket: string
  folder: string
  label?: string
  maxSizeMB?: number
  acceptedFormats?: string[]
  className?: string
}

export default function ImageUploader({
  currentImageUrl,
  onImageUploaded,
  onImageRemoved,
  bucket,
  folder,
  label = 'Imagen',
  maxSizeMB = 5,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  className = ''
}: ImageUploaderProps) {
  const { organization } = useOrganization()
  const { toast } = useToast()
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar formato
    if (!acceptedFormats.includes(file.type)) {
      toast({
        title: "Formato no válido",
        description: `Solo se aceptan: ${acceptedFormats.map(f => f.split('/')[1]).join(', ')}`,
        variant: "destructive"
      })
      return
    }

    // Validar tamaño
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > maxSizeMB) {
      toast({
        title: "Archivo muy grande",
        description: `El tamaño máximo es ${maxSizeMB}MB`,
        variant: "destructive"
      })
      return
    }

    await uploadImage(file)
  }

  const uploadImage = async (file: File) => {
    if (!organization?.id) {
      toast({
        title: "Error",
        description: "No se encontró la organización",
        variant: "destructive"
      })
      return
    }

    setIsUploading(true)
    try {
      // Generar nombre único
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${organization.id}/${folder}/${fileName}`

      // Subir a Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) throw error

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath)

      setPreviewUrl(publicUrl)
      onImageUploaded(publicUrl)

      toast({
        title: "✅ Imagen subida",
        description: "La imagen se ha subido correctamente"
      })
    } catch (error: any) {
      console.error('Error subiendo imagen:', error)
      toast({
        title: "Error al subir imagen",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveImage = async () => {
    if (!previewUrl) return

    try {
      // Extraer path del URL
      const urlParts = previewUrl.split(`${bucket}/`)
      if (urlParts.length > 1) {
        const filePath = urlParts[1]
        
        // Eliminar de Storage
        const { error } = await supabase.storage
          .from(bucket)
          .remove([filePath])

        if (error) throw error
      }

      setPreviewUrl(null)
      if (onImageRemoved) {
        onImageRemoved()
      }

      toast({
        title: "Imagen eliminada",
        description: "La imagen se ha eliminado correctamente"
      })
    } catch (error: any) {
      console.error('Error eliminando imagen:', error)
      toast({
        title: "Error al eliminar",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive"
      })
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <Label className="text-gray-700 dark:text-gray-300">
          {label}
        </Label>
      )}

      <div className="flex flex-col gap-3">
        {/* Preview */}
        {previewUrl ? (
          <div className="relative w-full h-48 border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden group">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRemoveImage}
                disabled={isUploading}
              >
                <X className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
            <div className="text-center">
              <ImageIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sin imagen
              </p>
            </div>
          </div>
        )}

        {/* Upload Button */}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFormats.join(',')}
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {previewUrl ? 'Cambiar Imagen' : 'Subir Imagen'}
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Formatos: {acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')} • 
          Máximo: {maxSizeMB}MB
        </p>
      </div>
    </div>
  )
}
