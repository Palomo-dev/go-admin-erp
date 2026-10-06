/**
 * Bucket de Supabase Storage de una imagen a partir de su `storage_path`: `products/` o
 * `productos/` → `product-images`; el resto → `organization_images`. Puro: lo comparten el
 * navegador (`storageImageUrl.ts`) y el servidor (plantilla completa del sitio web).
 */
export function bucketDeRutaImagen(storagePath: string): 'product-images' | 'organization_images' {
  return storagePath.startsWith('products/') || storagePath.startsWith('productos/') ? 'product-images' : 'organization_images';
}
