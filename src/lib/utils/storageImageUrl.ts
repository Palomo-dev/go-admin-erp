import { supabase } from '@/lib/supabase/config';

/**
 * URL pública de una imagen de producto guardada en Supabase Storage a
 * partir de su `storage_path`. El bucket se deduce del prefijo de la ruta:
 * `products/` o `productos/` → `product-images`; el resto →
 * `organization_images`.
 *
 * Vivía dentro de `posService.ts`; desde la fase 4D también la usa el
 * replicador del catálogo para precalentar la caché de medios sin red.
 */
export function getStorageImageUrl(storagePath: string): string {
  if (!storagePath) return '';
  const bucket = storagePath.startsWith('products/') || storagePath.startsWith('productos/') ? 'product-images' : 'organization_images';
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data?.publicUrl || '';
}
