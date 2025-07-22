import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useToast } from "@/components/ui/use-toast";
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Loader2, UploadCloud } from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// Constantes para validación de archivos
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE_MB = 5;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

interface SubirImagenesProps {
  organization_id?: number;
  onImageSelect: (image: any) => void;
}

export function SubirImagenes({ organization_id, onImageSelect }: SubirImagenesProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const { toast } = useToast();
  const supabase = createClientComponentClient();
  
  // Asegurar que tenemos organization_id
  const [orgId, setOrgId] = useState<number | undefined>(organization_id);

  useEffect(() => {
    const loadOrganizationId = () => {
      // Si ya tenemos organization_id por props, usarlo
      if (organization_id) {
        setOrgId(organization_id);
        return;
      }

      // Si no tenemos por props, obtenerlo de la utilidad centralizada
      const currentOrgId = getOrganizationId();
      if (currentOrgId) {
        console.log('SubirImagenes: usando organization_id de utilidad centralizada:', currentOrgId);
        setOrgId(currentOrgId);
        return;
      }
      
      // No mostramos errores explícitos para evitar alertas redundantes
      // Dejamos que el sistema de autenticación maneje esto
      console.log('No se encontró ID de organización');
    };
    
    loadOrganizationId();
  }, [organization_id]); // Eliminar dependencias innecesarias
  
  // Esta bandera previene que se guarde el producto automáticamente al subir imágenes
  const [imagenProcesada, setImagenProcesada] = useState(false);
    
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Usar orgId del state en lugar de organization_id de props
    if (!orgId) {
      toast({
        title: "Error",
        description: "No se pudo determinar la organización para subir imágenes",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    setImagenProcesada(true); // Activamos la bandera para saber que se procesó una imagen
    
    for (const file of acceptedFiles) {
      try {
        // Validar tamaño del archivo
        if(file.size > MAX_FILE_SIZE) {
          toast({
            title: "Archivo demasiado grande",
            description: `El archivo ${file.name} excede el límite de ${MAX_FILE_SIZE_MB}MB.`,
            variant: "destructive"
          });
          continue;
        }
        
        // Validar tipo de archivo
        if(!ALLOWED_FILE_TYPES.includes(file.type)) {
          toast({
            title: "Tipo de archivo no permitido",
            description: `Solo se permiten archivos de tipo: ${ALLOWED_FILE_TYPES.join(', ')}.`,
            variant: "destructive"
          });
          continue;
        }
        
        // Generar nombre único para el archivo
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const filePath = `${orgId}/${fileName}`;
        
        // Subir a Supabase Storage
        const { data: storageData, error: storageError } = await supabase
          .storage
          .from('organization_images')
          .upload(filePath, file);
          
        if (storageError) {
          console.error('Error al subir la imagen:', storageError);
          toast({
            title: "Error al subir imagen",
            description: storageError.message,
            variant: "destructive"
          });
          continue;
        }
        
        // Obtener URL firmada con expiración de 24 horas 
        const { data: signedUrlData } = await supabase
          .storage
          .from('organization_images')
          .createSignedUrl(filePath, 60 * 60 * 24); // 24 horas en segundos
          
        console.log('Usando organization_id:', orgId);
        
        // Registrar la imagen en la base de datos directamente en shared_images
        try {
          console.log('Insertando imagen directamente en shared_images:', {
            storage_path: filePath,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            organization_id: orgId
          });

          // Preparamos los datos para la inserción asegurándonos que sean válidos
          const imageData = {
            storage_path: filePath,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            organization_id: orgId,
            created_at: new Date().toISOString()
          };

          console.log('Datos de shared_images a insertar:', JSON.stringify(imageData));

          // Insertamos directamente en la tabla shared_images en lugar de usar RPC
          const { data, error } = await supabase
            .from('shared_images')
            .insert(imageData)
            .select()
            .single();
          
          if (error) {
            console.error('Error al insertar en shared_images:', error);
            console.error('Código de error:', error.code);
            console.error('Mensaje de error:', error.message);
            console.error('Detalles completos del error:', JSON.stringify(error));
            
            toast({
              title: "Error al registrar imagen",
              description: `No se pudo guardar la información de la imagen: ${error.message || 'Error desconocido'}`,
              variant: "destructive"
            });
            continue;
          }
          
          console.log('Respuesta de shared_images insert:', data);
          
          // Obtenemos el ID directamente del objeto insertado
          const sharedImageId = data?.id;
          
          if (sharedImageId) {
            console.log('ID de imagen recibido:', sharedImageId);
            
            // Crear objeto de imagen para el estado local
            const newImage = {
              url: signedUrlData?.signedUrl || '',
              path: filePath,
              displayOrder: uploadedImages.length + 1,
              isPrimary: uploadedImages.length === 0,
              shared_image_id: sharedImageId,
              width: 0,
              height: 0,
              size: file.size,
              mime_type: file.type
            };
            
            // Obtener dimensiones
            const dimensions = await getImageDimensions(file);
            newImage.width = dimensions.width;
            newImage.height = dimensions.height;
            
            // Agregar imagen al estado local
            setUploadedImages(prev => [...prev, newImage]);
            
            // Notificar que la imagen se subió temporalmente (no guardada en BD todavía)
            toast({
              title: "Imagen lista",
              description: `Imagen ${file.name} lista para guardar con el producto. No olvides hacer clic en 'Guardar Producto' para confirmar los cambios.`,
            });
            
            // Llamamos a onImageSelect para que el componente padre reciba la imagen
            onImageSelect(newImage);
          } else {
            console.error('Error: No se pudo obtener ID de imagen de la respuesta:', data || {});
            toast({
              title: "Error al registrar imagen",
              description: 'No se pudo obtener ID de la imagen subida. Inténtelo de nuevo.',
              variant: "destructive"
            });
          }
        } catch (error: any) {
          console.error('Error al insertar imagen:', error);
          toast({
            title: "Error",
            description: error.message || "Error al procesar la imagen",
            variant: "destructive"
          });
        }
      } catch (err) {
        // Manejar cualquier error no capturado durante el proceso
        console.error('Error inesperado al subir la imagen:', err);
        toast({
          title: "Error inesperado",
          description: "Ha ocurrido un error al subir la imagen. Por favor, inténtelo de nuevo.",
          variant: "destructive"
        });
      }
    }
    
    setIsUploading(false);
  }, [orgId, uploadedImages, toast, supabase]);
  
  // Configuración del dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    maxFiles: 5,
    multiple: true,
    disabled: !orgId || isUploading, 
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    maxSize: 5 * 1024 * 1024 // 5MB
  });
  
  // Utilidad para obtener dimensiones de la imagen
  const getImageDimensions = (file: File): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height
        });
      };
      img.src = URL.createObjectURL(file);
    });
  };
  
  return (
    <div className="p-4 space-y-6">
      {/* Área de dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-md p-8 text-center transition-colors duration-200 
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'} 
          ${isUploading ? 'opacity-50' : 'cursor-pointer'}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center">
          <UploadCloud className="h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {isDragActive
              ? "Suelta tus archivos aquí"
              : "Arrastra y suelta o haz clic para subir imágenes"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PNG, JPG, WEBP hasta 5MB
          </p>
          {isUploading && (
            <div className="mt-4 flex items-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Subiendo imágenes...</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Previsualización de imágenes recién subidas */}
      {uploadedImages.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Imágenes recién subidas</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {uploadedImages.map((image, index) => (
              <div 
                key={index} 
                className="relative group cursor-pointer rounded-md overflow-hidden border"
                onClick={() => onImageSelect(image)}
              >
                <img 
                  src={image.url} 
                  alt={`Imagen ${index + 1}`}
                  className="w-full h-24 object-contain bg-gray-50"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Button size="sm" variant="secondary">Seleccionar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
