"use client"

import { useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { Upload, X, ImagePlus } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import { v4 as uuidv4 } from 'uuid'
import { useDropzone } from 'react-dropzone'

import { Button } from '@/components/ui/button'
import { 
  Card, 
  CardContent 
} from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'

// Interfaz para exponer métodos al componente padre
export interface ImagenesRef {
  // Esta función retorna las imágenes para que el componente padre pueda usarlas
  getImagenes: () => Array<{url: string, path: string, displayOrder: number, isPrimary: boolean}>;
  
  // Esta función guarda las imágenes en la tabla product_images cuando se tiene el product_id
  guardarImagenesEnBD: (product_id: number) => Promise<{success: boolean, error?: any}>;
}

const Imagenes = forwardRef<ImagenesRef, {}>((props, ref) => {
  const { toast } = useToast()
  const [isUploading, setIsUploading] = useState(false)
  const [images, setImages] = useState<Array<{
    url: string;
    path: string;
    displayOrder: number;
    isPrimary: boolean;
  }>>([])

  // Estado para almacenar el ID de organización
  const [organization_id, setOrganizationId] = useState<number | null>(null)

  // Obtener la organización activa del localStorage
  const getOrganizacionActiva = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        const orgData = localStorage.getItem('organizacionActiva')
        if (!orgData) return null
        const parsed = JSON.parse(orgData)
        return parsed && parsed.id ? parsed : null
      }
      return null
    } catch (error) {
      console.error('Error al obtener organización activa:', error)
      return null
    }
  }, [])

  // Garantizar que tenemos una organización válida antes de continuar
  // Esto se ejecuta una vez al montar el componente y cada vez que se actualice localStorage
  useEffect(() => {
    // Verificar si ya tenemos una organización
    if (!organization_id) {
      const org = getOrganizacionActiva()
      if (org && org.id) {
        console.log('Organización encontrada en localStorage:', org.id)
        setOrganizationId(org.id)
      } else {
        // Si no se encuentra, configurar un valor predeterminado (esto debe ser reemplazado por un valor real)
        console.log('No se encontró organización en localStorage, usando valor predeterminado')
        setOrganizationId(1) // Usar ID 1 como respaldo
      }
    }

    // Crear un listener para cambios en localStorage (por si la organización cambia en otra pestaña)
    const handleStorageChange = () => {
      const org = getOrganizacionActiva()
      if (org && org.id) {
        setOrganizationId(org.id)
      }
    }

    // Agregar event listener para storage
    window.addEventListener('storage', handleStorageChange)
    
    // Limpiar event listener al desmontar
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [getOrganizacionActiva, organization_id])
  
  // Función para establecer una imagen como principal
  const setImageAsPrimary = (index: number) => {
    const updatedImages = images.map((img, i) => ({
      ...img,
      isPrimary: i === index
    }))
    setImages(updatedImages)
    toast({
      title: "Éxito",
      description: "Imagen principal actualizada",
    })
  }

  // Función para guardar imágenes en la tabla product_images cuando ya se tiene el product_id
  const guardarImagenesEnBD = async (product_id: number) => {
    try {
      // Verificar si tenemos imágenes para guardar
      if (images.length === 0) {
        return { success: true } // No hay imágenes para guardar
      }

      if (!product_id) {
        throw new Error("Se requiere el ID del producto para guardar las imágenes en la base de datos")
      }
      
      // Guardar todas las imágenes en la tabla product_images
      const promises = images.map(async (image, index) => {
        // Mapear los campos de nuestro estado local a los campos de la tabla product_images
        const productImage = {
          product_id: product_id,
          image_url: image.url,
          storage_path: image.path,
          display_order: image.displayOrder,
          is_primary: image.isPrimary,
          alt_text: `Imagen de producto ${index + 1}`
        }
        
        const { data, error } = await supabase
          .from('product_images')
          .insert(productImage)
          
        if (error) throw error
        
        return data
      })
      
      await Promise.all(promises)
      
      toast({
        title: "Éxito",
        description: `Se guardaron ${images.length} imágenes en la base de datos`
      })
      
      return { success: true }
    } catch (error) {
      console.error('Error al guardar las imágenes en la base de datos:', error)
      toast({
        title: "Error",
        description: "Ocurrió un error al guardar las imágenes en la base de datos",
        variant: "destructive"
      })
      return { success: false, error }
    }
  }

  // Exponer métodos al componente padre usando useImperativeHandle
  useImperativeHandle(ref, () => ({
    // Esta función retorna las imágenes para que el padre pueda usarlas
    getImagenes: () => images,
    // Esta función guarda las imágenes en la BD cuando ya existe el product_id
    guardarImagenesEnBD
  }))

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) {
      return
    }
    
    // Intentar obtener la organización una vez más si no está disponible
    let currentOrgId = organization_id
    if (!currentOrgId) {
      const org = getOrganizacionActiva()
      if (org && org.id) {
        currentOrgId = org.id
        setOrganizationId(org.id)
      } else {
        // Si definitivamente no hay organización, usar un valor predeterminado
        currentOrgId = 1 // ID predeterminado para permitir la carga
        setOrganizationId(currentOrgId)
      }
    }

    // Si aún no tenemos organización, mostrar error
    if (!currentOrgId) {
      toast({
        title: "Error",
        description: "No se ha seleccionado una organización",
        variant: "destructive"
      })
      return
    }

    // Procesar cada archivo aceptado
    for (const file of acceptedFiles) {
      const fileSize = file.size / 1024 / 1024 // en MB
      
      // Validar tamaño del archivo (máximo 5MB)
      if (fileSize > 5) {
        toast({
          title: "Error",
          description: "El archivo es demasiado grande. Máximo 5MB permitido.",
          variant: "destructive"
        })
        continue
      }
      
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Error",
          description: "Solo se permiten archivos de imagen",
          variant: "destructive"
        })
        continue
      }

      setIsUploading(true)

      try {
        const fileName = `${uuidv4()}-${file.name.replace(/\s+/g, '-').toLowerCase()}`
        const filePath = `productos/${currentOrgId}/${fileName}`
        
        // Subir archivo a Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('profiles')
          .upload(filePath, file)
          
        if (uploadError) throw uploadError

        // Obtener URL pública
        const { data: publicUrlData } = supabase.storage
          .from('profiles')
          .getPublicUrl(filePath)
          
        if (publicUrlData) {
          // La primera imagen subida será la principal (isPrimary = true)
          // y cada imagen tiene un orden de visualización según el orden de carga
          const isFirstImage = images.length === 0
          
          const newImage = {
            url: publicUrlData.publicUrl,
            path: filePath,
            displayOrder: images.length + 1,
            isPrimary: isFirstImage
          }
          
          setImages(prev => [...prev, newImage])
          
          toast({
            title: "Éxito",
            description: "Imagen subida correctamente",
          })
        }
      } catch (error) {
        console.error('Error al subir imagen:', error)
        toast({
          title: "Error",
          description: "Ocurrió un error al subir la imagen",
          variant: "destructive"
        })
      } finally {
        setIsUploading(false)
      }
    }
  }, [organization_id, toast])

  const handleRemoveImage = async (index: number) => {
    try {
      const imageToRemove = images[index]
      
      // Eliminar archivo de Storage
      if (imageToRemove.path) {
        const { error } = await supabase.storage
          .from('profiles')
          .remove([imageToRemove.path])
          
        if (error) throw error
      }
      
      // Eliminar de estado local
      setImages(prev => prev.filter((_, i) => i !== index))
      
      // Si esta era la imagen principal, hacer que la primera imagen restante sea la principal
      if (imageToRemove.isPrimary && images.length > 1) {
        const remainingImages = [...images].filter((_, i) => i !== index)
        if (remainingImages.length > 0) {
          // Actualizar la primera imagen restante como principal
          const updatedImages = remainingImages.map((img, i) => {
            return { ...img, isPrimary: i === 0 }
          })
          setImages(updatedImages)
        }
      }
      
      toast({
        title: "Éxito",
        description: "Imagen eliminada correctamente",
      })
    } catch (error) {
      console.error('Error al eliminar imagen:', error)
      toast({
        title: "Error",
        description: "Ocurrió un error al eliminar la imagen",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Imágenes del Producto</h3>
        
        <Button 
          variant="outline" 
          size="sm"
          disabled={isUploading}
          onClick={() => document.getElementById('dropzone-area')?.click()}
        >
          {isUploading ? (
            <>Subiendo...</>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" /> Subir Imagen
            </>
          )}
        </Button>
      </div>

      {/* Zona de arrastrar y soltar */}
      {images.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <Card key={index} className="overflow-hidden">
              <div className="aspect-square relative">
                <img 
                  src={image.url} 
                  alt={`Imagen de producto ${index + 1}`}
                  className="object-cover w-full h-full"
                />
                {image.isPrimary && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                    Principal
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center p-2 bg-black/50">
                  {!image.isPrimary && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs bg-white/70 hover:bg-white"
                      onClick={() => setImageAsPrimary(index)}
                    >
                      Hacer Principal
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRemoveImage(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <DropzoneArea onDrop={onDrop} isUploading={isUploading} />
      )}
    </div>
  )
})

Imagenes.displayName = 'Imagenes'

// Componente para la zona de arrastrar y soltar
const DropzoneArea = ({ onDrop, isUploading }: { onDrop: (files: File[]) => void, isUploading: boolean }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    disabled: isUploading,
    maxSize: 5 * 1024 * 1024 // 5MB
  });

  return (
    <div 
      {...getRootProps()} 
      className={`border-2 border-dashed rounded-md p-8 text-center transition-colors duration-200 ${
        isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/20'
      } cursor-pointer`}
      id="dropzone-area"
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center">
        <ImagePlus className="h-10 w-10 text-muted-foreground mb-2" />
        {isDragActive ? (
          <p className="text-sm text-primary font-medium">
            Suelta las imágenes aquí ...
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Arrastra y suelta o haz clic para subir imágenes
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG, WEBP hasta 5MB
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Imagenes
