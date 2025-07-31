'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';

interface FileUploadProps {
  bucket: string;
  folder?: string;
  accept?: string;
  maxSize?: number; // in bytes
  onUpload: (filePath: string) => void;
  onError?: (error: string) => void;
  currentFile?: string;
  className?: string;
  placeholder?: string;
  preview?: boolean;
}

export default function FileUpload({
  bucket,
  folder = '',
  accept = 'image/*',
  maxSize = 5 * 1024 * 1024, // 5MB default
  onUpload,
  onError,
  currentFile,
  className = '',
  placeholder = 'Seleccionar archivo',
  preview = true
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateFileName = (originalName: string): string => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop();
    return `${timestamp}-${randomString}.${extension}`;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file size
      if (file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
        onError?.(`El archivo es demasiado grande. Tamaño máximo: ${maxSizeMB}MB`);
        return;
      }

      // Validate file type
      if (accept !== '*' && !file.type.match(accept.replace('*', '.*'))) {
        onError?.(`Tipo de archivo no permitido. Formatos aceptados: ${accept}`);
        return;
      }

      setUploading(true);

      // Log para debugging
      console.log('Attempting upload:', {
        bucket,
        folder,
        fileName: generateFileName(file.name),
        filePath: folder ? `${folder}/${generateFileName(file.name)}` : generateFileName(file.name),
        fileSize: file.size,
        fileType: file.type
      });

      // Generate unique filename
      const fileName = generateFileName(file.name);
      const filePath = folder ? `${folder}/${fileName}` : fileName;

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Supabase upload error details:', {
          message: error.message || 'No message',
          name: error.name || 'No name',
          cause: error.cause || 'No cause',
          stack: error.stack || 'No stack',
          errorString: JSON.stringify(error),
          errorKeys: Object.keys(error),
          bucket,
          filePath,
          fileSize: file.size,
          fileType: file.type
        });
        onError?.(`Error al subir el archivo: ${error.message || 'Error desconocido'}`);
        return;
      }

      console.log('Upload successful:', { data, filePath });

      // Create preview URL for images
      if (preview && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviewUrl(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }

      // Return the file path
      onUpload(data.path);

    } catch (error: any) {
      console.error('Unexpected upload error:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        error: error
      });
      onError?.(`Error inesperado: ${error?.message || 'Error desconocido'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!currentFile) return;

    try {
      setUploading(true);

      // Remove file from Supabase Storage
      const { error } = await supabase.storage
        .from(bucket)
        .remove([currentFile]);

      if (error) {
        console.error('Remove error:', error);
        onError?.(`Error al eliminar el archivo: ${error.message}`);
        return;
      }

      // Clear the file
      onUpload('');
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Remove error:', error);
      onError?.('Error inesperado al eliminar el archivo');
    } finally {
      setUploading(false);
    }
  };

  const getPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
            id={`file-upload-${bucket}-${folder}`}
          />
          <label
            htmlFor={`file-upload-${bucket}-${folder}`}
            className={`
              inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer
              ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {uploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Subiendo...
              </>
            ) : (
              <>
                <svg className="-ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {placeholder}
              </>
            )}
          </label>
        </div>

        {currentFile && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="-ml-0.5 mr-1.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar
          </button>
        )}
      </div>

      {/* Preview */}
      {preview && (previewUrl || currentFile) && (
        <div className="mt-4">
          <img
            src={previewUrl || (currentFile ? getPublicUrl(currentFile) : '')}
            alt="Preview"
            className="h-32 w-32 object-cover rounded-lg border border-gray-300"
          />
        </div>
      )}

      {/* File info */}
      {currentFile && (
        <div className="text-sm text-gray-500">
          Archivo: {currentFile.split('/').pop()}
        </div>
      )}
    </div>
  );
}
