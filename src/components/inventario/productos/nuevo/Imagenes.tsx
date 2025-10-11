"use client"

import { useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { X, ImagePlus, Loader2 } from 'lucide-react'
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
    storage_path?: string
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

interface ImagenesProps {
  productoId?: number; // ID del producto para modo edición (opcional)
}

const Imagenes = forwardRef<ImagenesRef, ImagenesProps>(({ productoId }, ref) => {
  const { toast } = useToast()
  const [isUploading, setIsUploading] = useState(false)
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [images, setImages] = useState<Array<{
    url: string
    path: string
    storage_path?: string
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
  // Cargar imágenes existentes del producto si estamos en modo edición
  useEffect(() => {
    if (!productoId) return;

    const cargarImagenesExistentes = async () => {
      try {
        setIsLoadingImages(true);
        // Utilizamos JOIN directo para obtener datos de ambas tablas en un formato más predecible
        // Nota: Ya no usamos image_url porque fue reemplazado por storage_path
        const { data: productImages, error } = await supabase
          .from('product_images')
          .select('*, shared_image:shared_image_id(id, storage_path, file_name, file_size, mime_type, dimensions)')
          .eq('product_id', productoId)
          .order('display_order');
          
        console.log('Product images data:', productImages);
          
        if (error) throw error;
        
        if (productImages && productImages.length > 0) {
          // 2. Formatear los datos al formato que espera el estado images
          let formattedImages = productImages.map(img => {
            // Ya no usamos image_url, generamos la URL a partir del storage_path
            const path = img.shared_image?.storage_path || '';
            
            return {
              // La URL la obtendremos a través de updateImageUrlsInArray, usando path
              url: '',  // Placeholder, se actualizará abajo
              path: path,
              displayOrder: img.display_order,
              isPrimary: img.is_primary,
              shared_image_id: img.shared_image?.id,
              width: img.shared_image?.dimensions?.width,
              height: img.shared_image?.dimensions?.height,
              size: img.shared_image?.file_size,
              mime_type: img.shared_image?.mime_type
            };
          });
          
          // Actualizar las URLs para asegurar que no expiren usando getPublicUrl para cada storage_path
          const imgsWithUrls = formattedImages.map(img => {
            // Obtener URL pública directamente de Supabase
            let url = '';
            if (img.path) {
              const { data } = supabase.storage
                .from('organization_images')
                .getPublicUrl(img.path);
              url = data?.publicUrl || '';
            }
            
            return {
              ...img,
              url
            };
          });
          
          console.log('Imágenes con URLs actualizadas:', imgsWithUrls.map(img => ({ id: img.shared_image_id, path: img.path, url: img.url })));
          
          // 3. Establecer las imágenes en el estado
          setImages(imgsWithUrls);
        }
      } catch (error: any) {
        console.error('Error al cargar imágenes existentes:', error);
        // Mostrar el mensaje de error detallado para facilitar la depuración
        toast({
          title: "Error al cargar imágenes",
          description: error.message || "No se pudieron cargar las imágenes del producto",
          variant: "destructive"
        });
      } finally {
        setIsLoadingImages(false);
      }
    };
    
    cargarImagenesExistentes();
  }, [productoId, toast]);

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
    // Verificar organization_id para debugging
    console.log('Guardando imágenes para producto', product_id, 'con organización', organization_id);
    // Si estamos en modo edición, necesitamos manejar la actualización de imágenes existentes
    if (productoId) {
      try {
        // 1. Obtener las imágenes actuales del producto
        const { data: existingImages, error: fetchError } = await supabase
          .from('product_images')
          .select('id, shared_image_id')
          .eq('product_id', product_id);
          
        if (fetchError) throw fetchError;
        
        // 2. Identificar imágenes que hay que eliminar (las que ya no están en el estado actual)
        const currentImageIds = images.filter(img => img.shared_image_id).map(img => img.shared_image_id);
        const imagesToDelete = existingImages?.filter(img => !currentImageIds.includes(img.shared_image_id)) || [];
        
        // 3. Eliminar registros de imágenes que ya no están en el estado
        if (imagesToDelete.length > 0) {
          const deleteIds = imagesToDelete.map(img => img.id);
          const { error: deleteError } = await supabase
            .from('product_images')
            .delete()
            .in('id', deleteIds);
            
          if (deleteError) throw deleteError;
        }
      } catch (error: any) {
        console.error('Error al actualizar imágenes existentes:', error);
        return { success: false, error };
      }
    }
    try {
      if (images.length === 0) {
        return { success: true } // No hay imágenes que guardar
      }
      
      // Obtener el máximo display_order actual para este producto
      // para evitar conflictos de clave única
      let maxDisplayOrder = 0;
      try {
        const { data: existingImages, error: fetchError } = await supabase
          .from('product_images')
          .select('display_order')
          .eq('product_id', product_id)
          .order('display_order', { ascending: false })
          .limit(1);
          
        if (fetchError) {
          console.warn('Error al obtener orden máximo de imágenes:', fetchError);
        } else if (existingImages && existingImages.length > 0) {
          maxDisplayOrder = existingImages[0].display_order || 0;
          console.log('Orden máximo actual de imágenes:', maxDisplayOrder);
        }
      } catch (e) {
        console.warn('Error al calcular orden máximo de imágenes:', e);
      }

      // Si las imágenes tienen shared_image_id, usamos la función associate_image_to_product
      // para cada imagen compartida
      const insertPromises = images.map(async (image, index) => {
        // Asignar un display_order único y secuencial para evitar conflictos
        // Empezamos desde el máximo actual + 1 para evitar duplicados
        const displayOrder = maxDisplayOrder + index + 1;
        if (image.shared_image_id) {
          // Para imágenes que ya se han subido con upload_temporary_image
          try {
            // Asegurarse de que shared_image_id es un número válido
            const sharedImageId = typeof image.shared_image_id === 'number' 
              ? image.shared_image_id 
              : parseInt(String(image.shared_image_id), 10);
              
            if (isNaN(sharedImageId)) {
              console.error('shared_image_id inválido:', image.shared_image_id);
              throw new Error(`ID de imagen inválido: ${image.shared_image_id}`);
            }
            
            // Generar URL pública para la imagen usando storage_path o path
            let publicUrl = '';
            let storagePath = image.storage_path || image.path; // Usar storage_path si existe, si no, usar path
            
            if (storagePath) {
              const { data: urlData } = supabase.storage
                .from('organization_images')
                .getPublicUrl(storagePath);
              publicUrl = urlData?.publicUrl || '';
            }
            
            // Preparar datos para inserción en product_images
            // Nota: Verificamos la estructura de la tabla - sin organization_id
            const productImageData = {
              product_id,
              shared_image_id: sharedImageId,
              storage_path: storagePath, // Add required storage_path field
              is_primary: !!image.isPrimary,
              display_order: displayOrder,
            };
            
            // La columna url no existe en la tabla product_images
            // Guardamos solo los campos requeridos
            
            console.log('Insertando en product_images:', productImageData);
            
            // Inserción directa en la tabla product_images
            const { data: insertData, error: insertError } = await supabase
              .from('product_images')
              .insert(productImageData)
              .select();
              
            if (insertError) {
              console.error('Error al insertar en product_images:', insertError);
              console.error('Detalles completos del error:', JSON.stringify(insertError));
              throw new Error(`Error al asociar imagen: ${insertError.message || JSON.stringify(insertError)}`);
            }
            
            console.log('Imagen asociada correctamente:', insertData);
            return true;
            
          } catch (imgError: any) {
            console.error(`Error procesando imagen compartida:`, imgError);
            throw new Error(`Error procesando imagen: ${imgError?.message || 'Error desconocido'}`);
          }
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
              display_order: displayOrder // Usar el nuevo display_order calculado
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
      {/* Input file oculto */}
      <input
        id="dropzone-area"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            onDrop(files);
          }
          // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
          e.target.value = '';
        }}
      />
      
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Imágenes del Producto</h3>
        {isLoadingImages && (
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Cargando imágenes...
          </div>
        )}
        <Button 
          type="button"
          variant="outline" 
          size="sm"
          disabled={isUploading || !organization_id}
          onClick={() => document.getElementById('dropzone-area')?.click()}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Subiendo...
            </>
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
                      src={image.url || '/placeholder-image.png'} 
                      alt={`Imagen de producto ${index + 1}`}
                      className="object-cover w-full h-full"
                      onError={(e) => {
                        // Fallback to placeholder if image fails to load
                        const target = e.target as HTMLImageElement;
                        if (!target.dataset.usedFallback) {
                          target.dataset.usedFallback = 'true';
                          target.src = '/placeholder-image.png';
                        }
                      }}
                    />
                  </div>
                  
                  {/* Botones de acción para cada imagen */}
                  <div className="flex items-center justify-between mt-2 gap-1">
                    {!image.isPrimary && (
                      <Button 
                        type="button"
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
                      type="button"
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
        />
      </div>
    </div>
  )
})

Imagenes.displayName = 'Imagenes'

export default Imagenes
