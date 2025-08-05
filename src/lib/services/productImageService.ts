import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string;
}

interface ProductImage {
  id: number;
  product_id: number;
  storage_path: string;
  is_primary?: boolean;
  alt_text?: string;
  display_order: number;
}

interface ProductWithImages extends Product {
  images: ProductImage[];
}

/**
 * Busca un producto por SKU
 */
export async function findProductBySku(sku: string): Promise<ProductWithImages | null> {
  try {
    const organizationId = await getOrganizationId();
    if (!organizationId) {
      throw new Error('Organization ID not found');
    }

    const { data: product, error } = await supabase
      .from('products')
      .select(`
        id,
        sku,
        name,
        description,
        product_images (
          id,
          product_id,
          storage_path,
          is_primary,
          alt_text,
          display_order
        )
      `)
      .eq('organization_id', organizationId)
      .eq('sku', sku)
      .single();

    if (error) {
      console.error('Error finding product by SKU:', error);
      return null;
    }

    return {
      ...product,
      images: product.product_images || []
    };
  } catch (error) {
    console.error('Error in findProductBySku:', error);
    return null;
  }
}

/**
 * Busca productos por nombre (busqueda parcial)
 */
export async function findProductsByName(name: string): Promise<ProductWithImages[]> {
  try {
    const organizationId = await getOrganizationId();
    if (!organizationId) {
      throw new Error('Organization ID not found');
    }

    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        sku,
        name,
        description,
        product_images (
          id,
          product_id,
          storage_path,
          is_primary,
          alt_text,
          display_order
        )
      `)
      .eq('organization_id', organizationId)
      .ilike('name', `%${name}%`)
      .limit(5);

    if (error) {
      console.error('Error finding products by name:', error);
      return [];
    }

    return products.map(product => ({
      ...product,
      images: product.product_images || []
    }));
  } catch (error) {
    console.error('Error in findProductsByName:', error);
    return [];
  }
}

/**
 * Obtiene la imagen principal de un producto
 */
export function getPrimaryImageUrl(product: ProductWithImages): string | null {
  if (!product.images || product.images.length === 0) {
    return null;
  }

  // Buscar imagen marcada como primaria
  const primaryImage = product.images.find(img => img.is_primary);
  if (primaryImage) {
    return primaryImage.storage_path;
  }

  // Si no hay imagen primaria, usar la primera por orden de display
  const sortedImages = product.images.sort((a, b) => a.display_order - b.display_order);
  return sortedImages[0]?.storage_path || null;
}

/**
 * Obtiene todas las imágenes de un producto ordenadas
 */
export function getAllImageUrls(product: ProductWithImages): string[] {
  if (!product.images || product.images.length === 0) {
    return [];
  }

  return product.images
    .sort((a, b) => a.display_order - b.display_order)
    .map(img => img.storage_path);
}

/**
 * Busca automáticamente un producto y retorna sus imágenes basándose en variables de plantilla
 */
export async function getProductImagesFromTemplate(templateVariables: Record<string, string>): Promise<Record<string, string>> {
  const productImages: Record<string, string> = {};

  try {
    // Intentar buscar por SKU primero (más específico)
    if (templateVariables.product_sku) {
      const product = await findProductBySku(templateVariables.product_sku);
      if (product) {
        const primaryImageUrl = getPrimaryImageUrl(product);
        if (primaryImageUrl) {
          productImages.product_image = primaryImageUrl;
        }

        const allImages = getAllImageUrls(product);
        if (allImages.length > 1) {
          productImages.product_gallery = allImages[1]; // Segunda imagen como galería
        }
      }
    }

    // Si no se encontró por SKU, buscar por nombre
    if (!productImages.product_image && templateVariables.product_name) {
      const products = await findProductsByName(templateVariables.product_name);
      if (products.length > 0) {
        const product = products[0]; // Tomar el primer resultado
        const primaryImageUrl = getPrimaryImageUrl(product);
        if (primaryImageUrl) {
          productImages.product_image = primaryImageUrl;
        }

        const allImages = getAllImageUrls(product);
        if (allImages.length > 1) {
          productImages.product_gallery = allImages[1];
        }
      }
    }

    return productImages;
  } catch (error) {
    console.error('Error getting product images from template:', error);
    return {};
  }
}

/**
 * Convierte el storage_path de Supabase a URL pública
 */
export function getPublicImageUrl(storagePath: string): string {
  // Si ya es una URL completa, devolverla tal como está
  if (storagePath.startsWith('http')) {
    return storagePath;
  }

  // Si es un path de Supabase Storage, construir la URL pública
  const { data } = supabase.storage
    .from('product-images') // Asumiendo que existe un bucket llamado 'product-images'
    .getPublicUrl(storagePath);

  return data.publicUrl;
}
