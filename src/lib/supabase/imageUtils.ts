import { supabase } from './config';

/**
 * Convierte una URL de imagen firmada a su versión pública permanente
 * para evitar problemas de expiración de tokens
 */
export function getPublicImageUrl(imageUrl: string, storagePath: string): string {
  // Si la URL ya es una URL pública, devolverla tal cual
  if (imageUrl && !imageUrl.includes('/object/sign/')) {
    return imageUrl;
  }
  
  // Si no tenemos la ruta de almacenamiento, no podemos generar una URL pública
  if (!storagePath) {
    console.warn('No se proporcionó la ruta de almacenamiento para generar URL pública');
    return imageUrl; // Devolver la URL original como fallback
  }
  
  // Determinar el bucket basado en la URL actual o en la ruta de almacenamiento
  let bucket = 'organization_images'; // Bucket por defecto
  
  if (imageUrl) {
    // Intentar extraer el bucket de la URL original
    const urlParts = imageUrl.split('/');
    const signOrPublicIndex = urlParts.findIndex(part => part === 'sign' || part === 'public');
    
    if (signOrPublicIndex > 0 && signOrPublicIndex + 1 < urlParts.length) {
      bucket = urlParts[signOrPublicIndex + 1];
    }
  } else if (storagePath) {
    // Si no tenemos URL pero sí ruta, intentamos determinar el bucket
    // Asumimos que la ruta de almacenamiento no incluye el bucket
  }

  // Construir la URL pública permanente usando la URL base del proyecto Supabase
  // Evitamos usar la propiedad protegida supabaseUrl directamente
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jgmgphmzusbluqhuqihj.supabase.co";
  const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
  
  return publicUrl;
}

/**
 * Verifica si una URL de imagen de Supabase está activa y, si es una URL firmada que ha expirado,
 * la regenera utilizando la ruta de almacenamiento
 */
export async function ensureValidImageUrl(imageUrl: string, storagePath: string): Promise<string> {
  // Si no es una URL firmada, simplemente devolvemos la URL pública
  if (!imageUrl || !imageUrl.includes('/object/sign/')) {
    return getPublicImageUrl(imageUrl, storagePath);
  }
  
  // Para imágenes que están marcadas como públicas pero tienen URL firmada,
  // regeneramos una URL pública
  try {
    // Verificar si la imagen está marcada como pública en la base de datos
    const { data: imageData, error } = await supabase
      .from('shared_images')
      .select('is_public')
      .eq('storage_path', storagePath)
      .maybeSingle();
    
    if (error) throw error;
    
    // Si la imagen está marcada como pública, devolver URL pública permanente
    if (imageData && imageData.is_public) {
      return getPublicImageUrl(imageUrl, storagePath);
    }
    
    // Si la imagen no es pública, intentar regenerar una URL firmada
    const bucket = imageUrl.split('/').find((part, i, arr) => 
      arr[i-1] === 'sign' || arr[i-1] === 'public'
    ) || 'organization_images';
    
    const { data } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 días de validez
      
    return data?.signedUrl || imageUrl; // Devolver la nueva URL o la original como fallback
  } catch (e) {
    console.error('Error al regenerar URL de imagen:', e);
    return imageUrl; // En caso de error, devolver la URL original
  }
}

/**
 * Actualiza todas las URLs de un array de imágenes para garantizar que
 * sean válidas y no expiren
 */
export function updateImageUrlsInArray<T extends {url: string, path?: string}>(images: T[]): T[] {
  return images.map(img => ({
    ...img,
    url: getPublicImageUrl(img.url, img.path || '')
  }));
}
