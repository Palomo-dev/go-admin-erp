import { supabase } from '@/lib/supabase/config';

/**
 * Convert storage path to public URL
 * @param storagePath - The storage path (e.g., "organizations/123/logo_abc.jpg")
 * @param bucketName - The bucket name (default: 'logos')
 * @returns Public URL or null if path is invalid
 */
export const getStoragePublicUrl = (
  storagePath: string | null, 
  bucketName: string = 'logos'
): string | null => {
  if (!storagePath) return null;
  
  // If it's already a full URL, return as is
  if (storagePath.startsWith('http')) {
    return storagePath;
  }
  
  // Convert storage path to public URL
  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(storagePath);
  
  return publicUrl;
};

/**
 * Extract storage path from public URL
 * @param publicUrl - The public URL from Supabase
 * @param bucketName - The bucket name (default: 'logos')
 * @returns Storage path or the original URL if not a Supabase URL
 */
export const getStoragePathFromUrl = (
  publicUrl: string | null,
  bucketName: string = 'logos'
): string | null => {
  if (!publicUrl) return null;
  
  // If it's not a Supabase URL, return as is (might already be a path)
  if (!publicUrl.includes('supabase.co/storage/v1/object/public/')) {
    return publicUrl;
  }
  
  // Extract path from Supabase public URL
  const urlParts = publicUrl.split(`/storage/v1/object/public/${bucketName}/`);
  return urlParts.length > 1 ? urlParts[1] : publicUrl;
};

/**
 * Upload file to storage and return storage path
 * @param file - File to upload
 * @param path - Storage path where to upload
 * @param bucketName - Bucket name (default: 'logos')
 * @returns Storage path of uploaded file
 */
export const uploadFileToStorage = async (
  file: File,
  path: string,
  bucketName: string = 'logos'
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(path, file);

  if (error) {
    throw error;
  }

  return path;
};

/**
 * Delete file from storage
 * @param path - Storage path to delete
 * @param bucketName - Bucket name (default: 'logos')
 */
export const deleteFileFromStorage = async (
  path: string,
  bucketName: string = 'logos'
): Promise<void> => {
  const { error } = await supabase.storage
    .from(bucketName)
    .remove([path]);

  if (error) {
    throw error;
  }
};
