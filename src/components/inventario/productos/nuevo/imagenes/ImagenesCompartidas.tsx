import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useToast } from "@/components/ui/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { ImageItem } from './ImageDialog';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { getPublicImageUrl } from '@/lib/supabase/imageUtils';

interface ImagenesCompartidasProps {
  onImageSelect: (image: ImageItem) => void;
}

type ImagenItem = {
  id: number;
  image_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  dimensions: { width: number; height: number } | null;
  created_at: string;
  organization_id: number;
  storage_path?: string; // Añadida para manejar las rutas de almacenamiento
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
        
        // Consultar las imágenes públicas o compartidas
        const { data, error } = await supabaseClient
          .from('shared_images')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false });
          
        if (error) {
          throw error;
        }
        
        // Filtrar para excluir las de la organización actual (si tenemos el ID)
        let filteredData = data;
        if (currentOrgId) {
          filteredData = data.filter(img => img.organization_id !== currentOrgId);
        }
        
        // Corregir las URLs de las imágenes para usar rutas públicas
        const imgsWithFixedUrls = filteredData.map(img => {
          // Si la URL tiene el formato de URL firmada, convertirla a pública
          if (img.image_url && img.image_url.includes('/object/sign/')) {
            // Extraer la ruta del bucket y el objeto
            const urlParts = img.image_url.split('/object/sign/');
            if (urlParts.length > 1) {
              let objectPath = urlParts[1].split('?')[0]; // Eliminar el query string con el token
              img.image_url = `${urlParts[0]}/object/public/${objectPath}`;
            }
          }
          return img;
        });
        
        setImagenes(imgsWithFixedUrls || []);
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
    
    // Asegurar que la URL de la imagen sea pública permanente
    const publicUrl = getPublicImageUrl(imagen.image_url, imagen.storage_path || '');
    
    // Crear un objeto con la estructura esperada por el componente principal
    const selectedImage = {
      url: publicUrl, // Usar URL pública permanente
      path: imagen.storage_path || '', // Guardar la ruta para futuras conversiones si es necesario
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
    
    // Llamar al callback con la imagen seleccionada
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
                src={imagen.image_url} 
                alt={imagen.file_name}
                className="w-full h-32 object-cover"
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
