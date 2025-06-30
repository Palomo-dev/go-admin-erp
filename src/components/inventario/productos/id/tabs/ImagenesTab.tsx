'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

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

interface ProductImage {
  id: string;
  product_id: string;
  image_url?: string;
  storage_path?: string;
  display_order?: number;
  is_primary?: boolean;
  created_at?: string;
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
  const [images, setImages] = useState<ProductImage[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  
  // Función para obtener las imágenes del producto desde la base de datos
  const fetchImages = async () => {
    try {
      setLoading(true);
      
      // 1. Obtener las imágenes del producto
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', producto.id)
        .order('is_primary', { ascending: false })
        .order('display_order', { ascending: true });
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        // 2. No necesitamos procesar las imágenes para obtener URLs públicas
        // ya que usaremos directamente las URLs almacenadas en la base de datos
        const processedImages = data;
        
        setImages(processedImages);
      } else {
        setImages([]);
      }
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
  
  // Visualizar imagen en tamaño grande
  const handleViewImage = (url: string | null) => {
    if (url) {
      setPreviewImage(url);
    }
  };
  
  // Manejar carga de imágenes nuevas
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    
    try {
      const uploadedImages: ProductImage[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${organization?.id}/${producto.id}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        
        // 1. Subir archivo a Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('shared_images')
          .upload(`productos/${producto.id}/${fileName}`, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (uploadError) throw uploadError;
        
        // 2. Obtener URL pública
        const { data: publicURL } = supabase.storage
          .from('shared_images')
          .getPublicUrl(uploadData.path);
        
        if (!publicURL || !publicURL.publicUrl) throw new Error('No se pudo obtener la URL pública');
        
        // 3. Insertar referencia en base de datos
        const isPrimary = images.length === 0 && i === 0; // Primera imagen como principal
        
        const { data: imageRecord, error: dbError } = await supabase
          .from('product_images')
          .insert({
            product_id: producto.id,
            image_url: publicURL.publicUrl,
            storage_path: uploadData.path,
            is_primary: isPrimary,
            display_order: images.length + i + 1
          })
          .select()
          .single();
        
        if (dbError) throw dbError;
        
        uploadedImages.push(imageRecord);
      }
      
      setImages([...images, ...uploadedImages]);
      
      toast({
        title: "Imágenes cargadas",
        description: `Se han subido ${files.length} imágenes correctamente`,
      });
      
      // Recargar la página para mostrar las nuevas imágenes
      router.refresh();
      
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
  
  // Establecer imagen como principal
  const handleSetPrimary = async (imageId: string) => {
    setLoading(true);
    
    try {
      // 1. Obtener la imagen actual
      const { data: imageData, error: imageError } = await supabase
        .from('product_images')
        .select('*')
        .eq('id', imageId)
        .single();
      
      if (imageError) throw imageError;
      if (!imageData) throw new Error('No se encontró la imagen');
      
      // Determinar el bucket correcto basado en la ruta de almacenamiento
      let imageType = 'shared_images';
      if (imageData.storage_path) {
        if (imageData.storage_path.startsWith('profiles/')) {
          imageType = 'profiles';
        } else if (imageData.storage_path.includes('organization') || 
                  imageData.storage_path.includes(organization?.id?.toString() || '')) {
          imageType = 'organization_images';
        }
      }
      
      // 2. Actualizar el producto con la URL de la imagen principal
      const { error: updateError } = await supabase
        .from('products')
        .update({
          image_url: imageData.image_url,
          image_type: imageType,
          image_path: imageData.storage_path
        })
        .eq('id', producto.id);
      
      if (updateError) throw updateError;
      
      // 3. Recargar datos
      fetchImages();
      toast({
        variant: "default",
        title: "Éxito",
        description: "Imagen principal actualizada"
      });
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

  // Eliminar imagen
  const handleDeleteImage = async (imageId: string) => {
    try {
      setLoading(true);
      
      // 1. Obtener información de la imagen
      const imageToDelete = images.find(img => img.id === imageId);
      if (!imageToDelete) throw new Error('Imagen no encontrada');
      
      // 2. Eliminar registro de la base de datos
      const { error: dbError } = await supabase
        .from('product_images')
        .delete()
        .eq('id', imageId)
        .eq('product_id', producto.id);
      
      if (dbError) throw dbError;
      
      // 3. Eliminar archivo de Storage si existe el path
      if (imageToDelete.storage_path) {
        // Determinar el bucket correcto
        let bucketName = 'shared_images';
        
        if (imageToDelete.storage_path.startsWith('profiles/')) {
          bucketName = 'profiles';
        } else if (imageToDelete.storage_path.includes('organization') || 
                   imageToDelete.storage_path.includes(organization?.id?.toString() || '')) {
          bucketName = 'organization_images';
        }
        
        const { error: storageError } = await supabase.storage
          .from(bucketName)
          .remove([imageToDelete.storage_path]);
        
        // No bloqueamos si hay error al borrar el archivo físico
        if (storageError) console.error('Error al eliminar archivo:', storageError);
      }
      
      // 4. Si la imagen era principal, establecer otra como principal
      if (imageToDelete.is_primary && images.length > 1) {
        const nextImage = images.find(img => String(img.id) !== String(imageId));
        if (nextImage) {
          await supabase
            .from('product_images')
            .update({ is_primary: true })
            .eq('id', nextImage.id);
        }
      }
      
      // 5. Actualizar estado local
      setImages(images.filter(img => img.id !== imageId));
      
      toast({
        title: "Imagen eliminada",
        description: "La imagen se ha eliminado correctamente",
      });
      
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
  const renderImagePreview = (image: ProductImage) => {
    return (
      <div 
        key={image.id}
        className={`relative aspect-square cursor-pointer overflow-hidden rounded border group ${
          image.is_primary 
            ? 'border-blue-500 ring-2 ring-blue-500' 
            : 'border-gray-200 dark:border-gray-700'
        }`}
        onClick={() => handleViewImage(image.image_url || null)}
      >
        <img 
          src={image.image_url || '/placeholder-image.png'}
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
              handleViewImage(image.image_url || null);
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
                handleSetPrimary(image.id);
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
              handleDeleteClick(image.id);
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