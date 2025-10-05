'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { 
  loadProductImages, 
  uploadProductImage, 
  deleteProductImage,
  setProductPrimaryImage,
  ProductImageType
} from '@/lib/supabase/imageUtils';

import { Upload, Trash2, Eye, Star, Loader2, PackageIcon, ImageIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ImagenesTabProps {
  producto: any;
}



/**
 * Pestaña para gestionar las imágenes del producto
 */
const ImagenesTab: React.FC<ImagenesTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization } = useOrganization();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [images, setImages] = useState<ProductImageType[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  
  // Función para obtener las imágenes del producto usando nuestro nuevo imageUtils
  const fetchImages = async () => {
    try {
      setLoading(true);
      
      // Usamos el tipo ProductImageType de imageUtils para mantener consistencia
      const productImages = await loadProductImages(producto.id);
      setImages(productImages);
    } catch (error: unknown) {
      console.error('Error al cargar imágenes:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron cargar las imágenes del producto",
      });
    } finally {
      setLoading(false);
    }
  };

  // Cargar imágenes cuando el componente se monta
  useEffect(() => {
    fetchImages();
  }, [organization?.id, producto?.id]);
  
  // Función para generar URL pública directamente con la variable de entorno
  const generatePublicUrl = (storagePath?: string): string => {
    if (!storagePath) return '/placeholder-image.png';
    
    try {
      // Use direct path construction instead of getPublicUrl() for consistency with catalog
      return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/organization_images/${storagePath}`;
    } catch (error) {
      console.error('Error generating public URL:', error);
      return '/placeholder-image.png';
    }
  };
  
  // Visualizar imagen en tamaño grande
  const handleViewImage = (storagePath: string | null) => {
    if (storagePath) {
      // Usar Supabase storage directamente para obtener la URL pública
      setPreviewImage(generatePublicUrl(storagePath));
    }
  };
  
  // Manejar carga de imágenes nuevas usando el nuevo uploadProductImage
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Usar nuestra función uploadProductImage del nuevo imageUtils
        await uploadProductImage({
          file,
          productId: producto.id,
          organizationId: organization?.id || 0, // Aseguramos que no sea undefined
          isPrimary: images.length === 0 && i === 0,  // Primera imagen como principal
          displayOrder: images.length + i + 1
        });
      }
      
      // Recargar imágenes
      await fetchImages();
      
      toast({
        title: "Imágenes cargadas",
        description: `Se han subido ${files.length} imágenes correctamente`,
      });
      
    } catch (error: unknown) {
      console.error('Error al subir imágenes:', error);
      toast({
        variant: "destructive",
        title: "Error al subir",
        description: error instanceof Error ? error.message : "No se pudieron subir las imágenes. Intente de nuevo más tarde.",
      });
    } finally {
      setUploading(false);
      // Resetear el input de archivos
      if (e.target) e.target.value = '';
    }
  };
  
  // Establecer imagen como principal usando setProductPrimaryImage
  const handleSetPrimary = async (imageId: string) => {
    setLoading(true);
    
    try {
      // Usar nuestra función setProductPrimaryImage del nuevo imageUtils
      const success = await setProductPrimaryImage(imageId, producto.id);
      
      if (success) {
        // 3. Recargar datos
        fetchImages();
        toast({
          variant: "default",
          title: "Éxito",
          description: "Imagen principal actualizada"
        });
      }
    } catch (error: unknown) {
      console.error('Error al establecer imagen principal:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo establecer la imagen como principal",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Abrir diálogo de confirmación de eliminación
  const handleDeleteClick = (imageId: string) => {
    setImageToDelete(imageId);
    setIsDeleteDialogOpen(true);
  };

  // Confirmar y eliminar imagen
  const handleConfirmDelete = async () => {
    if (!imageToDelete) return;
    
    try {
      setLoading(true);
      await handleDeleteImage(imageToDelete);
    } finally {
      setIsDeleteDialogOpen(false);
      setImageToDelete(null);
      setLoading(false);
    }
  };

  // Eliminar imagen usando deleteProductImage
  const handleDeleteImage = async (imageId: string) => {
    try {
      setLoading(true);
      
      // Encontrar la imagen en el estado actual para obtener su storage_path
      const imageToDelete = images.find(img => img.id === imageId);
      if (!imageToDelete) throw new Error('Imagen no encontrada');
      
      // Usar nuestra función deleteProductImage del nuevo imageUtils
      // Si storage_path es undefined, pasamos una cadena vacía como fallback
      const success = await deleteProductImage(imageId, imageToDelete.storage_path || '');
      
      if (success) {
        // Actualizar estado local
        setImages(images.filter(img => img.id !== imageId));
        
        toast({
          title: "Imagen eliminada",
          description: "La imagen se ha eliminado correctamente",
        });
      }
    } catch (error: unknown) {
      console.error('Error al eliminar imagen:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar la imagen",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Renderizar la miniatura de una imagen
  const renderImagePreview = (image: ProductImageType) => {
    return (
      <div 
        key={image.id}
        className={`relative aspect-square cursor-pointer overflow-hidden rounded border group ${
          image.is_primary 
            ? 'border-blue-500 ring-2 ring-blue-500' 
            : 'border-gray-200 dark:border-gray-700'
        }`}
        onClick={() => image.storage_path ? handleViewImage(image.storage_path) : null}
      >
        <img 
          src={image.storage_path ? generatePublicUrl(image.storage_path) : '/placeholder-image.png'}
          alt={`Imagen ${image.id}`}
          className="h-full w-full object-cover transition-all group-hover:scale-110"
          onError={(e) => {
            // Evitar bucles infinitos verificando si ya intentamos cargar la imagen de respaldo
            const target = e.target as HTMLImageElement;
            if (!target.dataset.usedFallback) {
              target.dataset.usedFallback = 'true';
              target.src = '/placeholder-image.png';
            } else {
              // Si ya intentamos cargar la imagen de respaldo y también falló,
              // mostrar un elemento alternativo
              target.style.display = 'none';
              target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
              const placeholder = document.createElement('div');
              placeholder.innerHTML = '<span class="text-3xl mb-2">📷</span><span>Sin imagen</span>';
              target.parentElement?.appendChild(placeholder);
            }
          }}
        />
        
        {/* Acciones en hover */}
        <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 w-8 p-0 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              if (image.storage_path) {
                handleViewImage(image.storage_path);
              }
            }}
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">Ver</span>
          </Button>
          
          {!image.is_primary && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 w-8 p-0 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                if (image.id) {
                  handleSetPrimary(image.id);
                }
              }}
            >
              <Star className="h-4 w-4" />
              <span className="sr-only">Principal</span>
            </Button>
          )}
          
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 w-8 p-0 text-white hover:text-red-500 hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              if (image.id) {
                handleDeleteClick(image.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Eliminar</span>
          </Button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Cabecera y botón de carga */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-medium">Imágenes del Producto ({images.length})</h3>
        
        <div className="flex items-center gap-2">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 relative">
            <Button 
              variant="outline" 
              className={theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : ''}
              disabled={uploading}
            >
              <label htmlFor="file-upload" className="cursor-pointer w-full h-full flex flex-col items-center justify-center p-4 text-center text-gray-500 dark:text-gray-400">
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {uploading ? 'Subiendo...' : 'Subir Imágenes'}
              </label>
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                className="sr-only"
                onChange={handleUploadImages}
                accept="image/*"
                multiple
                disabled={loading}
              />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Diálogo de confirmación para eliminar */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás seguro de eliminar esta imagen?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. La imagen será eliminada permanentemente de este producto.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Galería de imágenes */}
      {loading ? (
        <div className="flex items-center justify-center h-32 bg-gray-100 dark:bg-gray-800 rounded-lg border border-dashed dark:border-gray-700 cursor-pointer">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : images.length === 0 ? (
        <div className={`p-8 text-center rounded-md border ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <PackageIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium">Sin imágenes</h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Este producto no tiene imágenes asociadas.
            Haga clic en "Subir Imágenes" para añadir fotografías.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 dark:bg-gray-900/20">
          {images.map((image) => (
            renderImagePreview(image)
          ))}
        </div>
      )}
      
      {/* Dialog para vista previa de imagen */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-square overflow-hidden w-full">
            {previewImage && (
              <img 
                className="w-full h-auto max-h-[80vh] object-contain" 
                src={previewImage || ''} 
                alt="Vista previa de imagen" 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImagenesTab;
