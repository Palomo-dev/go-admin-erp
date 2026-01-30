import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { SharedImage, ImageFormData, ImagesStats, ImageFilter } from './types';

export class ImagenesService {
  static async obtenerImagenes(filters?: ImageFilter): Promise<SharedImage[]> {
    const organizationId = getOrganizationId();

    let query = supabase
      .from('shared_images')
      .select('*')
      .or(`organization_id.eq.${organizationId},is_public.eq.true`)
      .order('created_at', { ascending: false });

    if (filters?.isPublic !== null && filters?.isPublic !== undefined) {
      query = query.eq('is_public', filters.isPublic);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Obtener conteos de productos que usan cada imagen
    const imagenesConConteos = await Promise.all(
      (data || []).map(async (img) => {
        const { count } = await supabase
          .from('product_images')
          .select('*', { count: 'exact', head: true })
          .eq('shared_image_id', img.id);

        // Generar URL pública
        let publicUrl = '';
        if (img.storage_path) {
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(img.storage_path);
          publicUrl = urlData?.publicUrl || '';
        }

        return {
          ...img,
          products_count: count || 0,
          public_url: publicUrl,
        };
      })
    );

    // Aplicar filtro de búsqueda
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      return imagenesConConteos.filter(img =>
        img.file_name.toLowerCase().includes(searchLower) ||
        img.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower))
      );
    }

    // Filtrar por tags
    if (filters?.tags && filters.tags.length > 0) {
      return imagenesConConteos.filter(img =>
        filters.tags!.some(tag => img.tags?.includes(tag))
      );
    }

    return imagenesConConteos;
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

    // Subir archivo a Storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
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
    // Verificar si está en uso
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
      await supabase.storage
        .from('product-images')
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
