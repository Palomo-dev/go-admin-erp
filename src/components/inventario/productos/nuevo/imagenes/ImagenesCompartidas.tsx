import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useToast } from "@/components/ui/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { ImageItem } from './ImageDialog';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
// Using direct Supabase storage calls for URL generation

interface ImagenesCompartidasProps {
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
  // Mantenemos image_url para compatibilidad con código existente
  image_url?: string;
  // Añadimos url generada directamente para mostrar la imagen
  url?: string;
};

export function ImagenesCompartidas({ onImageSelect }: ImagenesCompartidasProps) {
  const [imagenes, setImagenes] = useState<ImagenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const supabase = createClientComponentClient();
  
  // Cargar imágenes compartidas de todas las organizaciones
  useEffect(() => {
    // Creamos una variable para el cliente Supabase y evitar recrearlo
    const supabaseClient = supabase;
    
    const cargarImagenesCompartidas = async () => {
      try {
        setIsLoading(true);
        
        // Obtener el ID de la organización actual para excluir sus imágenes usando utilidad centralizada
        const currentOrgId = getOrganizationId();
        
        console.log('Cargando imágenes compartidas públicas');
        
        // Consultar las imágenes públicas o compartidas
        const { data, error } = await supabaseClient
          .from('shared_images')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false });
          
        console.log('Imágenes públicas recuperadas:', data?.length || 0);
          
        if (error) {
          throw error;
        }
        
        // Filtrar para excluir las de la organización actual (si tenemos el ID)
        let filteredData = data;
        if (currentOrgId) {
          filteredData = data.filter(img => img.organization_id !== currentOrgId);
        }
        
        // Procesar las imágenes para usar storage_path y generar URLs públicas adecuadas
        const processedImages = filteredData.map(img => {
          // Generar la URL pública directamente con Supabase storage
          let url = '';
          if (img.storage_path) {
            const { data } = supabaseClient.storage
              .from('organization_images')
              .getPublicUrl(img.storage_path);
            url = data?.publicUrl || '';
          }
          
          // Si no hay storage_path pero hay una image_url antigua, intentamos mantenerla como fallback
          const fallbackUrl = !img.storage_path && img.image_url ? img.image_url : '';
          
          return {
            ...img,
            url: url || fallbackUrl
          };
        });
        
        console.log('Imágenes compartidas procesadas con URLs públicas:', processedImages.length);
        setImagenes(processedImages);
      } catch (error: any) {
        console.error('Error al cargar imágenes compartidas:', error);
        toast({
          title: "Error",
          description: error.message || "No se pudieron cargar las imágenes compartidas",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    cargarImagenesCompartidas();
    // Eliminamos dependencia de supabase para evitar múltiples solicitudes
  }, []);
  
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
    
    // Generar una URL pública directamente con Supabase storage
    let publicUrl = '';
    if (imagen.storage_path) {
      const { data } = supabase.storage
        .from('organization_images')
        .getPublicUrl(imagen.storage_path);
      publicUrl = data?.publicUrl || '';
    }
    
    const selectedImage: ImageItem = {
      // Usar la URL pública generada o caer en image_url como última opción
      url: publicUrl || imagen.image_url || '',
      path: imagen.storage_path || '', // Siempre incluir storage_path si está disponible
      displayOrder: 1,
      isPrimary: true,
      shared_image_id: imagen.id,
      width: imagen.dimensions?.width,
      height: imagen.dimensions?.height,
      size: imagen.file_size,
      mime_type: imagen.mime_type
    };
    
    console.log('Imagen compartida seleccionada:', { 
      id: imagen.id, 
      path: imagen.storage_path,
      url: publicUrl
    });
    
    // Llamar al callback para seleccionar esta imagen
    onImageSelect(selectedImage);
  };
  
  return (
    <div className="p-4 space-y-6">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar imágenes compartidas..."
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
          {searchTerm ? "No se encontraron imágenes compartidas con ese nombre" : "No hay imágenes compartidas disponibles"}
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
                  // Fallback if image fails to load
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
                  Usar imagen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
