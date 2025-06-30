import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Usar rutas absolutas para evitar problemas de resolución
import { SubirImagenes } from "@/components/inventario/productos/nuevo/imagenes/SubirImagenes";
import { ImagenesOrganizacion } from "@/components/inventario/productos/nuevo/imagenes/ImagenesOrganizacion";
import { ImagenesCompartidas } from "@/components/inventario/productos/nuevo/imagenes/ImagenesCompartidas";

// Definir tipo para imágenes
export interface ImageItem {
  url: string;
  path?: string;
  displayOrder?: number;
  isPrimary?: boolean;
  shared_image_id?: number;
  width?: number;
  height?: number;
  size?: number;
  mime_type?: string;
}

interface ImageTabsProps {
  onImageSelect: (image: ImageItem) => void;
  // Eliminamos organization_id ya que ahora usamos getOrganizationId en cada componente
}

export function ImageTabs({ onImageSelect }: ImageTabsProps) {
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Gestión de imágenes</h3>
      <p className="text-sm text-muted-foreground">
        Sube nuevas imágenes o selecciona desde la biblioteca existente
      </p>
      
      <Tabs defaultValue="subir" className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="subir">Subir Imágenes</TabsTrigger>
          <TabsTrigger value="organizacion">Mi Organización</TabsTrigger>
          <TabsTrigger value="compartidas">Compartidas</TabsTrigger>
        </TabsList>
        
        <div className="py-4">
          <TabsContent value="subir" className="mt-0">
            <SubirImagenes onImageSelect={onImageSelect} />
          </TabsContent>
          <TabsContent value="organizacion" className="mt-0">
            <ImagenesOrganizacion onImageSelect={onImageSelect} />
          </TabsContent>
          <TabsContent value="compartidas" className="mt-0">
            <ImagenesCompartidas onImageSelect={onImageSelect} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// Exportar ImageDialog para mantener compatibilidad con código existente
export const ImageDialog = ImageTabs;
