"use client"

import { useState, useRef, useEffect } from 'react'
import { borrarImagenes, subirImagen, validarImagen } from './subidaImagen'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { X, Loader2, Image as ImageIcon } from 'lucide-react'
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
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sincronizar previewUrl cuando currentImageUrl cambia externamente (ej: IA)
  useEffect(() => {
    if (currentImageUrl && currentImageUrl !== previewUrl) {
      setPreviewUrl(currentImageUrl)
    }
  }, [currentImageUrl])

  /** Tipo y tamaño con la regla compartida (`subidaImagen.ts`); avisa con un toast. */
  const validar = (file: File): boolean => {
    const error = validarImagen(file, acceptedFormats, maxSizeMB)
    if (!error) return true
    toast({
      title: error.tipo === 'formato' ? "Formato no válido" : "Archivo muy grande",
      description: error.tipo === 'formato'
        ? `Solo se aceptan: ${acceptedFormats.map(f => f.split('/')[1]).join(', ')}`
        : `El tamaño máximo es ${maxSizeMB}MB`,
      variant: "destructive"
    })
    return false
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!validar(file)) return

    await uploadImage(file)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (!validar(file)) return

    await uploadImage(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
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

      // Subir a Supabase Storage (lógica compartida con la subida del chat del sitio web)
      const publicUrl = await subirImagen({ bucket, ruta: filePath, archivo: file })

      setPreviewUrl(publicUrl)
      onImageUploaded(publicUrl)

      toast({
        title: "✅ Imagen subida",
        description: "La imagen se ha subido correctamente"
      })
    } catch (error: unknown) {
      console.error('Error subiendo imagen:', error)
      toast({
        title: "Error al subir imagen",
        description: (error instanceof Error && error.message) || "Ocurrió un error inesperado",
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
        const { error } = await borrarImagenes(bucket, [filePath])

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
    } catch (error: unknown) {
      console.error('Error eliminando imagen:', error)
      toast({
        title: "Error al eliminar",
        description: (error instanceof Error && error.message) || "Ocurrió un error inesperado",
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
        {/* Drop zone + Preview */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          className={`relative w-full h-48 border-2 rounded-lg overflow-hidden transition-all cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.01]'
              : previewUrl
                ? 'border-gray-200 dark:border-gray-700 group'
                : 'border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'
          }`}
        >
          {previewUrl ? (
            <>
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
                  onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                {isUploading ? (
                  <Loader2 className="h-12 w-12 mx-auto text-blue-500 mb-2 animate-spin" />
                ) : (
                  <ImageIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isUploading ? 'Subiendo...' : isDragging ? 'Suelta la imagen aquí' : 'Haz clic o arrastra una imagen'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Formatos: {acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')} •
          Máximo: {maxSizeMB}MB
        </p>
      </div>
    </div>
  )
}
