'use client';

import { useState, useEffect } from 'react';
import { 
  loadProductImages, 
  uploadProductImage, 
  deleteProductImage,
  setProductPrimaryImage,
  updateImageUrlsInArray,
  ProductImageType
} from '@/lib/supabase/imageUtils';
import { supabase } from '@/lib/supabase/config';
import { Loader2, Plus, Star, Trash2, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ImageGalleryProps {
  productId: number;
  organizationId: number;
  readOnly?: boolean;
}

/**
 * Componente para gestionar la galería de imágenes de un producto
 * Utiliza las nuevas funciones optimizadas de imageUtils
 */
export function ImageGallery({ productId, organizationId, readOnly = false }: ImageGalleryProps) {
  const { toast } = useToast();
  const [images, setImages] = useState<ProductImageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Función para generar URL pública directamente con Supabase storage
  const generatePublicUrl = (storagePath?: string): string => {
    if (!storagePath) return '/placeholder-product.png';
    
    try {
      const { data } = supabase.storage
        .from('organization_images')
        .getPublicUrl(storagePath);
      return data?.publicUrl || '/placeholder-product.png';
    } catch (error) {
      console.error('Error generating public URL:', error);
      return '/placeholder-product.png';
    }
  };

  // Cargar imágenes al iniciar el componente
  useEffect(() => {
    loadImages();
  }, [productId]);

  // Función para cargar las imágenes del producto
  const loadImages = async () => {
    if (!productId) return;
    
    try {
      setLoading(true);
      const productImages = await loadProductImages(productId);
      setImages(productImages);
    } catch (error) {
      console.error('Error al cargar imágenes:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar las imágenes del producto"
      });
    } finally {
      setLoading(false);
    }
  };

  // Manejar la subida de imágenes
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    try {
      setUploading(true);
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPrimary = images.length === 0 && i === 0;
        
        await uploadProductImage({
          file,
          productId,
          organizationId,
          isPrimary,
          displayOrder: images.length + i + 1
        });
      }
      
      // Recargar imágenes
      await loadImages();
      
      toast({
        title: "Éxito",
        description: `Se ${files.length > 1 ? 'han' : 'ha'} subido ${files.length} ${files.length > 1 ? 'imágenes' : 'imagen'}`
      });
    } catch (error: any) {
      console.error('Error al subir imágenes:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudieron subir las imágenes"
      });
    } finally {
      setUploading(false);
      // Reset the input
      if (e.target) e.target.value = '';
    }
  };

  // Eliminar una imagen
  const handleDelete = async (imageId: string, storagePath?: string) => {
    if (!imageId) return;
    
    try {
      setLoading(true);
      const success = await deleteProductImage(imageId, storagePath);
      
      if (success) {
        // Actualizar estado local
        setImages(images.filter(img => img.id !== imageId));
        
        toast({
          title: "Imagen eliminada",
          description: "La imagen se ha eliminado correctamente"
        });
      }
    } catch (error) {
      console.error('Error al eliminar imagen:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la imagen"
      });
    } finally {
      setLoading(false);
    }
  };

  // Establecer imagen como principal
  const handleSetPrimary = async (imageId: string) => {
    if (!imageId) return;
    
    try {
      setLoading(true);
      const success = await setProductPrimaryImage(imageId, productId);
      
      if (success) {
        // Actualizar estado local
        setImages(images.map(img => ({
          ...img,
          is_primary: img.id === imageId
        })));
        
        toast({
          title: "Imagen principal",
          description: "La imagen se ha establecido como principal"
        });
      }
    } catch (error) {
      console.error('Error al establecer imagen principal:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo establecer la imagen como principal"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Imágenes del Producto</h3>
        
        {!readOnly && (
          <div className="flex items-center">
            <label htmlFor="upload-image" className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Agregar Imágenes</span>
              </div>
              <input
                id="upload-image"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        )}
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-md border-gray-300">
          <p className="mb-4 text-gray-500">No hay imágenes para este producto</p>
          {!readOnly && (
            <label htmlFor="upload-image-empty" className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none">
                <Plus className="w-4 h-4" />
                <span>Agregar Imágenes</span>
              </div>
              <input
                id="upload-image-empty"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {images.map((image) => (
            <div
              key={image.id}
              className={`relative aspect-square rounded-md overflow-hidden border group cursor-pointer ${
                image.is_primary ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200'
              }`}
            >
              {/* Imagen usando Supabase storage para obtener la URL directamente desde la ruta de storage */}
                <img
                  src={generatePublicUrl(image.storage_path)}
                  alt={image.alt_text || 'Producto'}
                  className="h-full w-full object-cover transition-all hover:scale-105"
                  onClick={() => setPreviewImage(generatePublicUrl(image.storage_path))}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/placeholder-product.png';
                  }}
                />
                
              <div className="absolute inset-0 flex items-center justify-center gap-2 transition-opacity bg-black bg-opacity-50 opacity-0 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 w-8 h-8 text-white hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewImage(generatePublicUrl(image.storage_path));
                  }}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                
                {!readOnly && (
                  <>
                    {!image.is_primary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-0 w-8 h-8 text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetPrimary(image.id!);
                        }}
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-0 w-8 h-8 text-white hover:bg-red-500 hover:bg-white/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(image.id!, image.storage_path);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
              
              {/* Indicador de imagen principal */}
              {image.is_primary && (
                <div className="absolute top-2 right-2">
                  <Star className="w-5 h-5 text-blue-500 fill-blue-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Modal de vista previa */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vista previa de imagen</DialogTitle>
          </DialogHeader>
          <div className="mt-4 overflow-hidden rounded-md">
            {previewImage && (
              <img
                src={previewImage}
                alt="Vista previa"
                className="object-contain w-full max-h-[70vh]"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
