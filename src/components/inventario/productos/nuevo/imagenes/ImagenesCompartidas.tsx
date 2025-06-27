import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useToast } from "@/components/ui/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { ImageItem } from './ImageDialog';

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
};

export function ImagenesCompartidas({ onImageSelect }: ImagenesCompartidasProps) {
  const [imagenes, setImagenes] = useState<ImagenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const supabase = createClientComponentClient();
  
  // Cargar imágenes compartidas de todas las organizaciones
  useEffect(() => {
    const cargarImagenesCompartidas = async () => {
      try {
        setIsLoading(true);
        
        // Obtener el ID de la organización actual para excluir sus imágenes
        let currentOrgId: number | null = null;
        const savedOrgId = localStorage.getItem('organization_id');
        if (savedOrgId) {
          currentOrgId = parseInt(savedOrgId);
        }
        
        // Consultar las imágenes públicas o compartidas
        const { data, error } = await supabase
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
        
        setImagenes(filteredData || []);
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
  }, [supabase, toast]);
  
  // Filtrar imágenes por término de búsqueda
  const filteredImagenes = searchTerm 
    ? imagenes.filter(img => 
        img.file_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : imagenes;
  
  // Función para seleccionar una imagen para el producto
  const handleSelectImage = (imagen: ImagenItem) => {
    // Crear un objeto con la estructura esperada por el componente principal
    const selectedImage = {
      url: imagen.image_url,
      path: '', // Esto se podría obtener si es necesario
      displayOrder: 1, // Por defecto será la primera
      isPrimary: true, // Por defecto será la principal
      shared_image_id: imagen.id,
      width: imagen.dimensions?.width || 0,
      height: imagen.dimensions?.height || 0,
      size: imagen.file_size,
      mime_type: imagen.mime_type
    };
    
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
              onClick={() => handleSelectImage(imagen)}
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
                <Button size="sm" variant="secondary">Usar imagen</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
