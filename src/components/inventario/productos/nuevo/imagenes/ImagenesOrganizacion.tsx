import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useToast } from "@/components/ui/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { ImageItem } from './ImageDialog';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
// Using direct Supabase storage calls for URL generation

interface ImagenesOrganizacionProps {
  organization_id?: number;
  onImageSelect: (image: ImageItem) => void;
}

type ImagenItem = {
  id: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  dimensions: { width: number; height: number } | null;
  created_at: string;
  organization_id: number;
  image_url?: string; // Mantenemos para compatibilidad con código existente
  url?: string; // Para almacenar la URL pública generada directamente
};

export function ImagenesOrganizacion({ organization_id, onImageSelect }: ImagenesOrganizacionProps) {
  const [imagenes, setImagenes] = useState<ImagenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const supabase = createClientComponentClient();
  
  // Cargar imágenes de la organización actual
  useEffect(() => {
    // Creamos una variable para el cliente Supabase y evitar recrearlo
    const supabaseClient = supabase;
    
    const cargarImagenes = async () => {
      try {
        setIsLoading(true);
        
        // Asegurarse de que tenemos un organization_id usando la utilidad centralizada
        const org_id = organization_id || getOrganizationId();
        if (!org_id) {
          console.log('No se encontró ID de organización en ImagenesOrganizacion');
          setIsLoading(false);
          return;
        }
        
        console.log('Cargando imágenes de la organización:', org_id);
        
        // Consultar las imágenes de esta organización
        const { data, error } = await supabaseClient
          .from('shared_images')
          .select('*')
          .eq('organization_id', org_id)
          .order('created_at', { ascending: false });
          
        console.log('Imágenes recuperadas:', data?.length || 0);
          
        if (error) {
          throw error;
        }
        
        // Procesar las imágenes para agregar URLs públicas usando directamente Supabase storage
        const processedImages = (data || []).map(img => {
          // Generar URL pública directamente con Supabase storage
          let publicUrl = '';
          if (img.storage_path) {
            const { data } = supabaseClient.storage
              .from('organization_images')
              .getPublicUrl(img.storage_path);
            publicUrl = data?.publicUrl || '';
          }
          
          return {
            ...img,
            // Agregar la URL generada y mantener image_url como fallback
            url: publicUrl,
            image_url: img.image_url || ''
          };
        });
        
        console.log('Imágenes procesadas con URLs públicas:', processedImages.length);
        setImagenes(processedImages);
      } catch (error: any) {
        console.error('Error al cargar imágenes:', error);
        toast({
          title: "Error",
          description: error.message || "No se pudieron cargar las imágenes",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    cargarImagenes();
    // Eliminamos dependencias que causan re-renders innecesarios
  }, [organization_id]);
  
  // Filtrar imágenes por término de búsqueda
  const filteredImagenes = searchTerm 
    ? imagenes.filter(img => 
        img.file_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : imagenes;
  
  // Función para seleccionar una imagen para el producto
  const handleSelectImage = (e: React.MouseEvent, imagen: ImagenItem) => {
    // Prevenir el comportamiento por defecto del evento que podría causar envío del formulario
    e.preventDefault();
    e.stopPropagation();
    
    // Generar URL pública directamente con Supabase storage
    let publicUrl = '';
    if (imagen.storage_path) {
      const { data } = supabase.storage
        .from('organization_images')
        .getPublicUrl(imagen.storage_path);
      publicUrl = data?.publicUrl || '';
    }
    
    // Crear un objeto con la estructura esperada por el componente principal
    const selectedImage: ImageItem = {
      // Usar la URL pública generada o la url ya calculada en el objeto imagen
      url: publicUrl || imagen.url || imagen.image_url || '',
      path: imagen.storage_path || '', // Usar storage_path en lugar de una cadena vacía
      displayOrder: 1, // Por defecto será la primera
      isPrimary: true, // Por defecto será la principal
      shared_image_id: imagen.id,
      width: imagen.dimensions?.width || 0,
      height: imagen.dimensions?.height || 0,
      size: imagen.file_size,
      mime_type: imagen.mime_type
    };
    
    // Notificar al usuario que debe hacer clic en 'Guardar Producto' para confirmar
    toast({
      title: "Imagen seleccionada",
      description: `La imagen ${imagen.file_name} ha sido seleccionada. No olvides hacer clic en 'Guardar Producto' para confirmar los cambios.`,
    });
    
    onImageSelect(selectedImage);
  };
  
  return (
    <div className="p-4 space-y-6">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar por nombre de archivo..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Estado de carga */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredImagenes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No se encontraron imágenes con ese nombre" : "No hay imágenes disponibles en tu organización"}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredImagenes.map((imagen) => (
            <div 
              key={imagen.id}
              className="group relative rounded-md overflow-hidden border cursor-pointer"
              onClick={(e) => handleSelectImage(e, imagen)}
            >
              <img 
                src={imagen.url || imagen.image_url || '/placeholder-image.png'} 
                alt={imagen.file_name}
                className="w-full h-32 object-cover"
                onError={(e) => {
                  // Establecer imagen de respaldo si falla la carga
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.usedFallback) {
                    target.dataset.usedFallback = 'true';
                    target.src = '/placeholder-image.png';
                  }
                }}
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2">
                <p className="text-white text-xs truncate">{imagen.file_name}</p>
                <p className="text-white/70 text-[10px]">
                  {new Date(imagen.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Button 
                  size="sm" 
                  variant="secondary"
                  type="button" /* Importante: especificar tipo button para evitar envío de formulario */
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectImage(e, imagen);
                  }}
                >
                  Seleccionar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
