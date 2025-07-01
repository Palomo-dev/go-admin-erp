import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Define la estructura de un bucket de Supabase
 */
export type StorageBucket = 'organization_images';

/**
 * Interfaz para imágenes de productos
 */
export interface ProductImageType {
  id?: string;
  product_id?: number;
  storage_path: string;
  bucket?: StorageBucket;
  display_order?: number;
  is_primary?: boolean;
  alt_text?: string;
}

/**
 * Todas las imágenes ahora se almacenan en organization_images
 */
export function getBucketName(): StorageBucket {
  return 'organization_images';
}

/**
 * Genera una URL pública para una ruta de almacenamiento usando organization_images
 */
export function getPublicUrl(storagePath: string): string {
  // Validación de entrada
  if (!storagePath) {
    console.log('getPublicUrl: Empty storagePath provided');
    return '';
  }
  
  // Crear cliente de Supabase
  const supabase = createClientComponentClient();
  
  // Usar directamente organization_images bucket
  const { data } = supabase.storage
    .from('organization_images')
    .getPublicUrl(storagePath);
  
  if (!data?.publicUrl) {
    console.error(`getPublicUrl: Failed to get public URL for ${storagePath}`);
    return '';
  }
  
  return data.publicUrl;
}

/**
 * Carga imágenes de un producto de manera eficiente
 * Retorna las imágenes con URLs públicas ya calculadas
 */
export async function loadProductImages(productId: number): Promise<ProductImageType[]> {
  if (!productId) {
    console.log('loadProductImages: No product ID provided');
    return [];
  }
  
  try {
    console.log(`loadProductImages: Loading images for product ${productId}`);
    const supabase = createClientComponentClient();
    
    // Consulta optimizada para obtener solo los campos necesarios
    const { data, error } = await supabase
      .from('product_images')
      .select('id, product_id, storage_path, display_order, is_primary')
      .eq('product_id', productId)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true });
    
    if (error) {
      console.error('Error al cargar imágenes del producto:', error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.log(`loadProductImages: No images found for product ${productId}`);
      return [];
    }
    
    console.log(`loadProductImages: Found ${data.length} images for product ${productId}:`, data);
    return data;
  } catch (e) {
    console.error('Error inesperado al cargar imágenes:', e);
    return [];
  }
}

/**
 * Sube una imagen de producto y crea los registros necesarios
 */
export async function uploadProductImage({
  file,
  productId,
  organizationId,
  isPrimary = false,
  displayOrder = 1,
  altText = ''
}: {
  file: File;
  productId: number;
  organizationId: number;
  isPrimary?: boolean;
  displayOrder?: number;
  altText?: string;
}): Promise<ProductImageType | null> {
  if (!file || !productId || !organizationId) {
    console.error('Faltan datos requeridos para subir imagen');
    return null;
  }
  
  try {
    // Validar archivo
    if (file.size > 5 * 1024 * 1024) { // 5MB
      throw new Error(`La imagen excede el tamaño máximo de 5MB`);
    }
    
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      throw new Error(`Formato no soportado: ${file.type}. Use JPG, PNG, WebP o GIF`);
    }
    
    const supabase = createClientComponentClient();
    
    // Generar nombre único para el archivo
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${productId}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
    const filePath = `productos/${fileName}`;
    
    // Subir a Storage
    const { error: uploadError } = await supabase.storage
      .from('organization_images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) throw uploadError;
    
    // Insertar registro en la base de datos
    const { data: imageRecord, error: dbError } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        storage_path: filePath,
        is_primary: isPrimary,
        display_order: displayOrder,
        alt_text: altText
      })
      .select()
      .single();
    
    if (dbError) throw dbError;
    
    return imageRecord;
  } catch (error: any) {
    console.error('Error al subir imagen de producto:', error);
    throw error;
  }
}

/**
 * Elimina una imagen de producto y su archivo asociado
 */
export async function deleteProductImage(imageId: string, storagePath?: string): Promise<boolean> {
  if (!imageId) return false;
  
  try {
    const supabase = createClientComponentClient();
    
    // Si no tenemos la ruta de almacenamiento, la buscamos primero
    let path = storagePath;
    if (!path) {
      const { data } = await supabase
        .from('product_images')
        .select('storage_path')
        .eq('id', imageId)
        .single();
      
      path = data?.storage_path;
    }
    
    // Eliminar registro de la base de datos
    const { error: dbError } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId);
    
    if (dbError) throw dbError;
    
    // Eliminar archivo de Storage si tenemos la ruta
    if (path) {
      await supabase.storage
        .from('organization_images')
        .remove([path]);
    }
    
    return true;
  } catch (error) {
    console.error('Error al eliminar imagen:', error);
    return false;
  }
}

/**
 * Establece una imagen como principal para un producto
 */
export async function setProductPrimaryImage(imageId: string, productId: number): Promise<boolean> {
  if (!imageId || !productId) return false;
  
  try {
    const supabase = createClientComponentClient();
    
    // 1. Quitar marca de principal de todas las imágenes del producto
    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId);
    
    // 2. Marcar la imagen seleccionada como principal
    const { error } = await supabase
      .from('product_images')
      .update({ is_primary: true })
      .eq('id', imageId)
      .eq('product_id', productId);
    
    if (error) throw error;
    
    // 3. Actualizar la referencia en la tabla de productos
    const { data: imageData } = await supabase
      .from('product_images')
      .select('storage_path')
      .eq('id', imageId)
      .single();
    
    if (imageData?.storage_path) {
      // Actualizar el producto con la referencia a la imagen principal
      await supabase
        .from('products')
        .update({
          image_path: imageData.storage_path
        })
        .eq('id', productId);
    }
    
    return true;
  } catch (error) {
    console.error('Error al establecer imagen principal:', error);
    return false;
  }
}

/**
 * Función helper para renderizar imágenes de producto con manejo de errores
 */
export function getProductImageUrl(image?: ProductImageType | null): string {
  if (!image) {
    console.log('getProductImageUrl: No image object provided');
    return '/placeholder-product.png';
  }
  
  if (!image.storage_path) {
    console.log('getProductImageUrl: Image is missing storage_path:', image);
    return '/placeholder-product.png';
  }
  
  console.log(`getProductImageUrl: Getting URL for image with storage_path ${image.storage_path}`);
  return getPublicUrl(image.storage_path);
}

/**
 * Obtiene la URL pública de una imagen a partir de la ruta de almacenamiento
 * Esta función es un alias de getPublicUrl para mantener compatibilidad con código existente
 */
export function getPublicImageUrl(storagePath: string): string {
  return getPublicUrl(storagePath);
}

/**
 * Actualiza un array de objetos con URLs públicas basadas en sus paths de almacenamiento
 * @param images Array de imágenes que contienen un campo path
 * @returns El mismo array con URLs actualizadas
 */
export function updateImageUrlsInArray<T extends { path: string, url: string }>(images: T[]): T[] {
  // Si no hay imágenes, devolver el array vacío
  if (!images || images.length === 0) return images;

  console.log(`updateImageUrlsInArray: Updating URLs for ${images.length} images`);
  
  // Crear cliente de Supabase
  const supabase = createClientComponentClient();
  
  return images.map(image => {
    // Solo actualizar si hay un path válido
    if (image.path) {
      // Generar URL pública directamente desde Supabase
      const { data } = supabase.storage
        .from('organization_images')
        .getPublicUrl(image.path);
        
      if (data?.publicUrl) {
        return { ...image, url: data.publicUrl };
      }
    }
    // Si no hay path o no se pudo generar URL, mantener el objeto original
    return image;
  });
}
