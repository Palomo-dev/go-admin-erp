import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface SpaceImage {
  id: string;
  space_id: string;
  organization_id: number;
  image_url: string;
  storage_path: string;
  is_primary: boolean;
  display_order: number;
  alt_text: string | null;
  created_at: string;
  uploaded_by: string | null;
}

const BUCKET = 'space-images';
const MAX_IMAGES_PER_SPACE = 10;

// ─── Servicio ────────────────────────────────────────────────────────────────

const spaceImageService = {
  /**
   * Obtener todas las imágenes de un espacio ordenadas por display_order
   */
  async getImages(spaceId: string): Promise<SpaceImage[]> {
    const { data, error } = await supabase
      .from('space_images')
      .select('*')
      .eq('space_id', spaceId)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching space images:', error);
      return [];
    }
    return data as SpaceImage[];
  },

  /**
   * Subir una imagen al storage y registrar en la tabla
   */
  async uploadImage(
    file: File,
    spaceId: string,
    organizationId: number,
    userId: string,
    altText?: string
  ): Promise<SpaceImage | null> {
    // Verificar límite
    const existing = await this.getImages(spaceId);
    if (existing.length >= MAX_IMAGES_PER_SPACE) {
      throw new Error(`Máximo ${MAX_IMAGES_PER_SPACE} imágenes por espacio`);
    }

    // Generar ruta única
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileId = crypto.randomUUID();
    const storagePath = `${organizationId}/${spaceId}/${fileId}.${ext}`;

    // Subir archivo al bucket
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      throw new Error('No se pudo subir la imagen');
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = urlData.publicUrl;

    // Si es la primera imagen, marcarla como principal
    const isPrimary = existing.length === 0;
    const nextOrder = existing.length > 0
      ? Math.max(...existing.map((img) => img.display_order)) + 1
      : 0;

    // Insertar registro en la tabla
    const { data, error } = await supabase
      .from('space_images')
      .insert({
        space_id: spaceId,
        organization_id: organizationId,
        image_url: imageUrl,
        storage_path: storagePath,
        is_primary: isPrimary,
        display_order: nextOrder,
        alt_text: altText || null,
        uploaded_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting space image:', error);
      // Rollback: borrar archivo subido
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw new Error('No se pudo registrar la imagen');
    }

    return data as SpaceImage;
  },

  /**
   * Establecer una imagen como principal (las demás se desmarcan)
   */
  async setPrimary(imageId: string, spaceId: string): Promise<boolean> {
    // Desmarcar todas
    const { error: unsetError } = await supabase
      .from('space_images')
      .update({ is_primary: false })
      .eq('space_id', spaceId);

    if (unsetError) {
      console.error('Error unsetting primary:', unsetError);
      return false;
    }

    // Marcar la seleccionada
    const { error: setError } = await supabase
      .from('space_images')
      .update({ is_primary: true })
      .eq('id', imageId);

    if (setError) {
      console.error('Error setting primary:', setError);
      return false;
    }

    return true;
  },

  /**
   * Actualizar el orden de las imágenes
   */
  async updateOrder(images: { id: string; display_order: number }[]): Promise<boolean> {
    for (const img of images) {
      const { error } = await supabase
        .from('space_images')
        .update({ display_order: img.display_order })
        .eq('id', img.id);

      if (error) {
        console.error('Error updating order:', error);
        return false;
      }
    }
    return true;
  },

  /**
   * Actualizar texto alternativo
   */
  async updateAltText(imageId: string, altText: string): Promise<boolean> {
    const { error } = await supabase
      .from('space_images')
      .update({ alt_text: altText })
      .eq('id', imageId);

    if (error) {
      console.error('Error updating alt text:', error);
      return false;
    }
    return true;
  },

  /**
   * Eliminar imagen (storage + tabla)
   */
  async deleteImage(imageId: string): Promise<boolean> {
    // Obtener ruta del archivo
    const { data: img, error: fetchError } = await supabase
      .from('space_images')
      .select('storage_path, is_primary, space_id')
      .eq('id', imageId)
      .single();

    if (fetchError || !img) {
      console.error('Error fetching image for delete:', fetchError);
      return false;
    }

    // Borrar del storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([img.storage_path]);

    if (storageError) {
      console.error('Error deleting from storage:', storageError);
      // Continuamos con el borrado del registro de todas formas
    }

    // Borrar registro de la tabla
    const { error: deleteError } = await supabase
      .from('space_images')
      .delete()
      .eq('id', imageId);

    if (deleteError) {
      console.error('Error deleting image record:', deleteError);
      return false;
    }

    // Si era la principal, asignar la primera imagen restante como principal
    if (img.is_primary) {
      const remaining = await this.getImages(img.space_id);
      if (remaining.length > 0) {
        await this.setPrimary(remaining[0].id, img.space_id);
      }
    }

    return true;
  },

  /**
   * Eliminar todas las imágenes de un espacio (útil al borrar un espacio)
   */
  async deleteAllImages(spaceId: string): Promise<boolean> {
    const images = await this.getImages(spaceId);

    if (images.length === 0) return true;

    // Borrar archivos del storage
    const paths = images.map((img) => img.storage_path);
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);

    if (storageError) {
      console.error('Error deleting files from storage:', storageError);
    }

    // Borrar registros (el CASCADE también los borra, pero por seguridad)
    const { error } = await supabase
      .from('space_images')
      .delete()
      .eq('space_id', spaceId);

    if (error) {
      console.error('Error deleting all space images:', error);
      return false;
    }

    return true;
  },
};

export default spaceImageService;
