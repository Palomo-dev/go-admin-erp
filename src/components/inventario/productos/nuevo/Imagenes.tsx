"use client"

import { useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import { v4 as uuidv4 } from 'uuid'

import { Button } from '@/components/ui/button'
import { 
  Card, 
  CardContent 
} from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ImageTabs, ImageItem } from './imagenes/ImageDialog'

// Interfaz para exponer métodos al componente padre
export interface ImagenesRef {
  // Esta función retorna las imágenes para que el componente padre pueda usarlas
  getImagenes: () => Array<{
    url: string
    path: string
    displayOrder: number
    isPrimary: boolean
    shared_image_id?: number
    width?: number
    height?: number
    size?: number
    mime_type?: string
  }>;
  
  // Esta función guarda las imágenes en la tabla product_images cuando ya se tiene el product_id
  guardarImagenesEnBD: (product_id: number) => Promise<{success: boolean, error?: any}>
}

const Imagenes = forwardRef<ImagenesRef, {}>((props, ref) => {
  const { toast } = useToast()
  const [isUploading, setIsUploading] = useState(false)
  const [images, setImages] = useState<Array<{
    url: string
    path: string
    displayOrder: number
    isPrimary: boolean
    shared_image_id?: number
    width?: number
    height?: number
    size?: number
    mime_type?: string
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
        
        // Guardar inmediatamente en localStorage para asegurarnos de que esté disponible
        if (typeof window !== 'undefined') {
          localStorage.setItem('organization_id', org.id.toString())
        }
      } else {
        // Si no se encuentra, configurar un valor predeterminado (esto debe ser reemplazado por un valor real)
        console.log('No se encontró organización en localStorage, usando valor predeterminado')
        const defaultOrgId = 1 // Usar ID 1 como respaldo
        setOrganizationId(defaultOrgId)
        
        // Guardar el valor predeterminado
        if (typeof window !== 'undefined') {
          localStorage.setItem('organization_id', defaultOrgId.toString())
        }
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
      if (images.length === 0) {
        return { success: true } // No hay imágenes que guardar
      }

      // Si las imágenes tienen shared_image_id, usamos la función associate_image_to_product
      // para cada imagen compartida
      const insertPromises = images.map(async (image) => {
        if (image.shared_image_id) {
          // Para imágenes que ya se han subido con upload_temporary_image
          // Asegurarse de que shared_image_id es un número
          const sharedImageId = typeof image.shared_image_id === 'number' ? image.shared_image_id : Number(image.shared_image_id);
          
          const { data, error } = await supabase.rpc('associate_image_to_product', {
            p_product_id: product_id,
            p_shared_image_id: sharedImageId,
            p_is_primary: image.isPrimary,
            p_display_order: image.displayOrder
          })
          
          if (error) {
            console.error('Error al asociar imagen compartida:', error)
            throw error
          }
          return data
        } else {
          // Para imágenes que se subieron con el sistema antiguo (mantener compatibilidad)
          const { error } = await supabase
            .from('product_images')
            .insert({
              product_id,
              organization_id: organization_id || '0', // Mantener como string
              url: image.url,
              path: image.path,
              is_primary: image.isPrimary,
              display_order: image.displayOrder
            })
          
          if (error) {
            console.error('Error al guardar imagen antigua:', error)
            throw error
          }
          return true
        }
      })

      // Esperamos a que todas las inserciones se completen
      await Promise.all(insertPromises)
      return { success: true }

    } catch (error) {
      console.error('Error en guardarImagenesEnBD:', error)
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

    try {
      setIsUploading(true)
      
      for (const file of acceptedFiles) {
        // Verificar tamaño máximo (5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: "Error",
            description: `La imagen ${file.name} excede el tamaño máximo de 5MB`,
            variant: "destructive"
          })
          continue
        }

        // Verificar tipo de archivo
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          toast({
            title: "Error",
            description: `Formato no soportado: ${file.type}. Use JPG, PNG o WEBP`,
            variant: "destructive"
          })
          continue
        }

        // Generar un nombre único para evitar colisiones
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`
        const filePath = `${organization_id}/${fileName}`

        // Crear un objeto para leer dimensiones de la imagen
        const getImageDimensions = (file: File) => {
          return new Promise<{width: number, height: number}>((resolve) => {
            const img = new Image();
            img.onload = () => {
              resolve({width: img.width, height: img.height});
              URL.revokeObjectURL(img.src); // Liberar memoria
            };
            img.src = URL.createObjectURL(file);
          });
        };

        // Obtener dimensiones de la imagen
        const dimensions = await getImageDimensions(file);

        // Subir a Storage (ahora usamos el bucket organization_images)
        const { error: uploadError } = await supabase.storage
          .from('organization_images')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        // Obtener la URL pública
        const { data: publicUrlData } = supabase.storage
          .from('organization_images')
          .getPublicUrl(filePath)

        // Preparar las dimensiones como JSONB para la función RPC
        const dimensionsJson = {
          width: dimensions.width || 0,
          height: dimensions.height || 0
        };

        // Asegurarnos que tenemos un organization_id válido
        if (!organization_id) {
          console.error('Error: No se ha establecido un organization_id válido');
          toast({
            title: "Error",
            description: "No se ha podido determinar la organización. Por favor, actualiza la página e inténtalo de nuevo.",
            variant: "destructive"
          });
          throw new Error('No se ha establecido un organization_id válido');
        }
        
        console.log('Usando organization_id:', organization_id);
        
        // Usar la nueva función que utiliza SECURITY DEFINER para saltarse RLS
        console.log('Usando función con bypass RLS. organization_id:', organization_id);
        try {
          // Usamos la función administrativa con priviliegios elevados
          console.log('Llamando a función administrativa con organization_id:', organization_id);
          const { data, error } = await supabase.rpc('admin_register_image', {
            p_image_url: publicUrlData.publicUrl,
            p_storage_path: filePath,
            p_file_name: file.name,
            p_file_size: file.size,
            p_mime_type: file.type,
            p_organization_id: organization_id
          });
          
          if (error) {
            // Mostrar el objeto de error completo para depuración
            console.error('Error al insertar imagen con bypass RLS:', error);
            console.error('Detalles completos del error:', JSON.stringify(error));
            
            // Extraer información útil del error para mostrar al usuario
            const errorMessage = error?.message || 'Error desconocido';
            const errorCode = error?.code || '???';
            
            // Intentar obtener más detalles del error si están disponibles
            const errorDetails = error?.details ? error.details : '';
            const errorHint = error?.hint ? error.hint : '';
            
            // Mostrar mensaje detallado al usuario
            toast({
              title: "Error al subir imagen",
              description: `${errorMessage} (código ${errorCode})\nOrganizationID: ${organization_id}`,
              variant: "destructive"
            });
            
            // Reintentar inserción directa
            try {
              console.log('Intentando inserción alternativa directamente en la tabla...');
              const { data: directInsertData, error: directError } = await supabase
                .from('shared_images')
                .insert({
                  image_url: publicUrlData.publicUrl,
                  storage_path: filePath,
                  file_name: file.name,
                  file_size: file.size,
                  mime_type: file.type,
                  organization_id: organization_id,
                  is_public: false,
                  created_at: new Date().toISOString()
                })
                .select('id');
                
              if (directError) {
                console.error('Error en inserción directa:', directError);
                throw directError;
              }
              
              if (directInsertData && directInsertData.length > 0) {
                console.log('Inserción directa exitosa:', directInsertData);
                return directInsertData[0].id;
              }
            } catch (directCatchError) {
              console.error('Error capturado en inserción directa:', directCatchError);
              // Continuar con el error original
            }
            
            throw error;
          }
          
          console.log('Respuesta de admin_register_image:', data);
          
          // La función administrativa devuelve un objeto JSON con los campos success e image_id
          if (data && data.success === true && data.image_id) {
            const sharedImageId = data.image_id;
            console.log('ID de imagen recibido correctamente:', sharedImageId);
            
            // Actualizar el estado con los datos de la imagen compartida
            setImages(prevImages => {
              const newImage = {
                url: publicUrlData.publicUrl,
                path: filePath,
                displayOrder: prevImages.length + 1,
                isPrimary: prevImages.length === 0, // La primera imagen es la principal
                shared_image_id: sharedImageId, // ID devuelto por la función RPC
                width: dimensions.width,
                height: dimensions.height,
                size: file.size,
                mime_type: file.type
              }
              return [...prevImages, newImage]
            })
            
            toast({
              title: "Éxito",
              description: "Imagen subida correctamente",
            });
            
            return; // Finalizar la función después de actualizar el estado
          } else {
            // Si no hay éxito o no hay image_id, lanzar error
            console.error('Error en la respuesta de admin_register_image:', data);
            throw new Error(data?.message || 'No se pudo registrar la imagen');
          }
          
          return;
        } catch (error: any) {
          console.error('Error al insertar imagen:', error);
          throw error;
        }

        // El estado ya se actualiza dentro del bloque try, no es necesario repetirlo aquí
      }
    } catch (error: any) {
      console.error('Error al subir imagen:', error)
      toast({
        title: "Error",
        description: error.message || "Error al subir imagen",
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
    }
  }, [organization_id, toast])

  const handleRemoveImage = async (index: number) => {
    try {
      const imageToRemove = images[index]
      
      // Eliminar del Storage
      const { error } = await supabase.storage
        .from('organization_images') // Cambiado de 'profiles' a 'organization_images'
        .remove([imageToRemove.path])
      
      if (error) throw error

      // Si la imagen tiene shared_image_id, eliminamos el registro temporal
      // Nota: No eliminamos la imagen compartida permanentemente, solo el registro temporal
      // ya que podría estar siendo usada por otros productos
      if (imageToRemove.shared_image_id) {
        const { error: deleteError } = await supabase.rpc('delete_temporary_image', {
          p_shared_image_id: imageToRemove.shared_image_id
        })
        
        if (deleteError) {
          console.error('Error al eliminar imagen temporal:', deleteError)
          // Continuamos aunque haya error, ya que la imagen física ya se eliminó
        }
      }

      // Actualizar el estado
      setImages(prevImages => {
        const newImages = [...prevImages]
        newImages.splice(index, 1)

        // Si eliminamos la imagen principal y aún quedan imágenes, establecer la primera como principal
        if (imageToRemove.isPrimary && newImages.length > 0) {
          newImages[0].isPrimary = true
        }

        // Reordenar las imágenes
        return newImages.map((img, i) => ({
          ...img,
          displayOrder: i + 1
        }))
      })

      toast({
        title: "Éxito",
        description: "Imagen eliminada correctamente",
      })
    } catch (error: any) {
      console.error('Error al eliminar imagen:', error)
      toast({
        title: "Error",
        description: error.message || "Error al eliminar imagen",
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
              <ImagePlus className="mr-2 h-4 w-4" /> Subir Imagen
            </>
          )}
        </Button>
      </div>

      {/* Si no hay imágenes mostrar formulario de subida, de lo contrario mostrar grid de imágenes */}
      <div className="space-y-4">
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {/* Mostrar imágenes subidas */}
            {images.map((image, index) => (
              <Card key={index} className={`overflow-hidden relative ${image.isPrimary ? 'ring-2 ring-primary' : ''}`}>
                <CardContent className="p-2">
                  {/* Vista previa de imagen */}
                  <div className="relative aspect-square overflow-hidden rounded-md">
                    <img 
                      src={image.url} 
                      alt={`Imagen de producto ${index + 1}`}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  
                  {/* Botones de acción para cada imagen */}
                  <div className="flex items-center justify-between mt-2 gap-1">
                    {!image.isPrimary && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setImageAsPrimary(index)}
                      >
                        <ImagePlus className="mr-1 h-3 w-3" />
                        Principal
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveImage(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {/* Mostrar tabs de gestión de imágenes */}
        <ImageTabs 
          onImageSelect={(imageData: ImageItem) => {
            setImages(prev => [...prev, {
              ...imageData,
              path: imageData.path || '',  // Asegurar que path siempre tenga un valor string
              displayOrder: prev.length + 1,
              isPrimary: prev.length === 0
            }])
          }} 
          organization_id={organization_id || undefined} 
        />
      </div>
    </div>
  )
})

Imagenes.displayName = 'Imagenes'

export default Imagenes
