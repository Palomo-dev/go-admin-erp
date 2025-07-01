import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Cache para URLs públicas para evitar regeneración innecesaria
const urlCache = new Map<string, string>();

/**
 * Define la estructura de un bucket de Supabase
 */
export type StorageBucket = 'organization_images' | 'shared_images' | 'profiles';

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
 * Determina automáticamente el bucket correcto basado en la ruta de almacenamiento
 */
export function determineBucket(storagePath: string): StorageBucket {
  if (!storagePath) return 'shared_images';
  
  if (storagePath.startsWith('profiles/')) {
    return 'profiles';
  } else if (storagePath.includes('organization')) {
    return 'organization_images';
  } else {
    return 'shared_images';
  }
}

/**
 * Obtiene la URL pública de una imagen directamente usando el cliente de Supabase
 * Esta función es eficiente y usa el método oficial recomendado por Supabase
 */
export function getPublicUrl(storagePath: string, bucket?: StorageBucket): string {
  if (!storagePath) return '';
  
  // Usar el cache para evitar regeneraciones innecesarias
  const cacheKey = `${bucket || 'auto'}:${storagePath}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }
  
  // Si no se especifica un bucket, determinarlo automáticamente
  const actualBucket = bucket || determineBucket(storagePath);
  
  // Crear cliente de Supabase (esto es seguro en componentes cliente)
  const supabase = createClientComponentClient();
  
  // Generar URL pública usando el método oficial de Supabase
  const { data } = supabase.storage
    .from(actualBucket)
    .getPublicUrl(storagePath);
  
  // Guardar en cache
  if (data?.publicUrl) {
    urlCache.set(cacheKey, data.publicUrl);
  }
  
  return data?.publicUrl || '';
}

/**
 * Carga imágenes de un producto de manera eficiente
 * Retorna las imágenes con URLs públicas ya calculadas
 */
export async function loadProductImages(productId: number): Promise<ProductImageType[]> {
  if (!productId) return [];
  
  try {
    const supabase = createClientComponentClient();
    
    // Consulta optimizada para obtener solo los campos necesarios
    const { data, error } = await supabase
      .from('product_images')
      .select('id, product_id, storage_path, display_order, is_primary')
      .eq('product_id', productId)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true });
    
    if (error || !data) {
      console.error('Error al cargar imágenes del producto:', error);
      return [];
    }
    
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
      .from('shared_images')
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
      const bucket = determineBucket(path);
      await supabase.storage
        .from(bucket)
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
  if (!image || !image.storage_path) return '/placeholder-product.png';
  
  return getPublicUrl(image.storage_path, image.bucket);
}

/**
 * Obtiene la URL pública de una imagen a partir de la ruta de almacenamiento
 * Esta función es un alias de getPublicUrl para mantener compatibilidad con código existente
 */
export function getPublicImageUrl(storagePath: string, bucket?: StorageBucket): string {
  return getPublicUrl(storagePath, bucket);
}

/**
 * Actualiza las URLs de las imágenes en un array utilizando sus storage_paths
 * Útil para procesar listas de imágenes y actualizar sus URLs
 */
export function updateImageUrlsInArray<T extends { storage_path?: string, url?: string }>(items: T[]): T[] {
  if (!items || items.length === 0) return items;
  
  return items.map(item => {
    if (item.storage_path) {
      return {
        ...item,
        url: getPublicUrl(item.storage_path)
      };
    }
    return item;
  });
}
