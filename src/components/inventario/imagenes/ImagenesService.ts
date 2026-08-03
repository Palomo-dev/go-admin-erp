import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { SharedImage, ImageFormData, ImagesStats, ImageFilter } from './types';

export class ImagenesService {
  static async obtenerImagenes(filters?: ImageFilter): Promise<SharedImage[]> {
    const organizationId = getOrganizationId();

    // Consultar shared_images de la organización o públicas
    let query = supabase
      .from('shared_images')
      .select('*')
      .or(`organization_id.eq.${organizationId},is_public.eq.true`)
      .order('created_at', { ascending: false });

    // En paralelo, consultar product_images de la organización
    const { data: sharedData, error: sharedError } = await query;
    if (sharedError) throw sharedError;

    const { data: productImgsData, error: productImgsError } = await supabase
      .from('product_images')
      .select(`
        id,
        product_id,
        storage_path,
        is_primary,
        alt_text,
        created_at,
        products!inner ( id, name, organization_id )
      `)
      .eq('products.organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (productImgsError) {
      console.error('Error cargando product_images:', productImgsError);
    }

    // Procesar shared_images con conteos de productos
    const sharedImagenes = await Promise.all(
      (sharedData || []).map(async (img) => {
        const { count } = await supabase
          .from('product_images')
          .select('*', { count: 'exact', head: true })
          .eq('shared_image_id', img.id);

        let publicUrl = '';
        if (img.storage_path) {
          const bucket = (img.storage_path.startsWith('products/') || img.storage_path.startsWith('productos/')) ? 'product-images' : 'organization_images';
          const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(img.storage_path);
          publicUrl = urlData?.publicUrl || '';
        }

        return {
          ...img,
          products_count: count || 0,
          public_url: publicUrl,
        } as SharedImage;
      })
    );

    // Procesar product_images y convertirlas al formato SharedImage
    const productImagenes: SharedImage[] = (productImgsData || []).map((pi: any) => {
      const storagePath = pi.storage_path || '';
      const bucket = (storagePath.startsWith('products/') || storagePath.startsWith('productos/')) ? 'product-images' : 'organization_images';
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);

      const fileName = storagePath.split('/').pop() || 'producto';
      const productName = pi.products?.name || '';

      return {
        id: pi.id + 100000,
        storage_path: storagePath,
        file_name: pi.alt_text || fileName,
        file_size: 0,
        mime_type: 'image/jpeg',
        dimensions: null,
        organization_id: organizationId,
        is_public: false,
        tags: productName ? [productName] : [],
        created_at: pi.created_at,
        updated_at: pi.created_at,
        products_count: 1,
        public_url: urlData?.publicUrl || '',
      } as SharedImage;
    });

    // Combinar ambas fuentes, evitando duplicados por storage_path
    const allImagenes = [...sharedImagenes];
    const existingPaths = new Set(sharedImagenes.map(img => img.storage_path));
    for (const pImg of productImagenes) {
      if (!existingPaths.has(pImg.storage_path)) {
        allImagenes.push(pImg);
        existingPaths.add(pImg.storage_path);
      }
    }

    // Ordenar por created_at descendente
    allImagenes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Aplicar filtro de visibilidad sobre el resultado combinado
    if (filters?.isPublic !== null && filters?.isPublic !== undefined) {
      return allImagenes.filter(img => img.is_public === filters.isPublic);
    }

    // Aplicar filtro de búsqueda
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      return allImagenes.filter(img =>
        img.file_name.toLowerCase().includes(searchLower) ||
        img.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower))
      );
    }

    // Filtrar por tags
    if (filters?.tags && filters.tags.length > 0) {
      return allImagenes.filter(img =>
        filters.tags!.some(tag => img.tags?.includes(tag))
      );
    }

    return allImagenes;
  }

  static async obtenerStats(): Promise<ImagesStats> {
    const imagenes = await this.obtenerImagenes();

    return {
      total: imagenes.length,
      public: imagenes.filter(i => i.is_public).length,
      private: imagenes.filter(i => !i.is_public).length,
      inUse: imagenes.filter(i => (i.products_count || 0) > 0).length,
      totalSize: imagenes.reduce((sum, i) => sum + (i.file_size || 0), 0),
    };
  }

  static async obtenerTags(): Promise<string[]> {
    const imagenes = await this.obtenerImagenes();
    const allTags = imagenes.flatMap(i => i.tags || []);
    return Array.from(new Set(allTags)).sort();
  }

  static async subirImagen(file: File): Promise<SharedImage> {
    const organizationId = getOrganizationId();
    const fileName = `${Date.now()}-${file.name}`;
    const storagePath = `${organizationId}/${fileName}`;

    // Subir archivo a Storage (usar organization_images para imágenes compartidas)
    const { error: uploadError } = await supabase.storage
      .from('organization_images')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // Obtener dimensiones (si es imagen)
    let dimensions = null;
    if (file.type.startsWith('image/')) {
      dimensions = await this.getImageDimensions(file);
    }

    // Crear registro en shared_images
    const { data, error } = await supabase
      .from('shared_images')
      .insert({
        organization_id: organizationId,
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        dimensions,
        is_public: false,
        tags: [],
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        resolve(null);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  static async actualizarImagen(id: number, data: Partial<ImageFormData>): Promise<SharedImage> {
    // IDs > 100000 vienen de product_images, no se pueden editar desde shared_images
    if (id > 100000) {
      const realId = id - 100000;
      const { data: updated, error } = await supabase
        .from('product_images')
        .update({
          alt_text: data.file_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', realId)
        .select()
        .single();

      if (error) throw error;
      return updated as SharedImage;
    }

    const { data: updated, error } = await supabase
      .from('shared_images')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  static async eliminarImagen(id: number): Promise<void> {
    // IDs > 100000 vienen de product_images
    if (id > 100000) {
      const realId = id - 100000;

      // Obtener storage_path
      const { data: img } = await supabase
        .from('product_images')
        .select('storage_path')
        .eq('id', realId)
        .single();

      // Eliminar archivo de Storage
      if (img?.storage_path) {
        const bucket = (img.storage_path.startsWith('products/') || img.storage_path.startsWith('productos/')) ? 'product-images' : 'organization_images';
        await supabase.storage
          .from(bucket)
          .remove([img.storage_path]);
      }

      // Eliminar registro de product_images
      const { error } = await supabase
        .from('product_images')
        .delete()
        .eq('id', realId);

      if (error) throw error;
      return;
    }

    // Verificar si está en uso (shared_images)
    const { count } = await supabase
      .from('product_images')
      .select('*', { count: 'exact', head: true })
      .eq('shared_image_id', id);

    if (count && count > 0) {
      throw new Error('No se puede eliminar una imagen que está en uso');
    }

    // Obtener datos de la imagen
    const { data: img } = await supabase
      .from('shared_images')
      .select('storage_path')
      .eq('id', id)
      .single();

    // Eliminar archivo de Storage
    if (img?.storage_path) {
      const bucket = (img.storage_path.startsWith('products/') || img.storage_path.startsWith('productos/')) ? 'product-images' : 'organization_images';
      await supabase.storage
        .from(bucket)
        .remove([img.storage_path]);
    }

    // Eliminar registro
    const { error } = await supabase
      .from('shared_images')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
