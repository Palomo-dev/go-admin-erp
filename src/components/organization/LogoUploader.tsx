'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import { uploadFileToStorage, deleteFileFromStorage } from '@/lib/utils/storage';
import StorageImage from '@/components/ui/StorageImage';

interface LogoUploaderProps {
  organizationId?: string;
  onLogoChange: (url: string | null) => void;
  initialLogo?: string | null;
  className?: string;
}

export default function LogoUploader({ 
  organizationId, 
  onLogoChange, 
  initialLogo = null,
  className = ''
}: LogoUploaderProps) {
  const [logo, setLogo] = useState<string | null>(initialLogo);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    const file = e.target.files[0];
    const fileSize = file.size / 1024 / 1024; // size in MB
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Por favor selecciona una imagen válida');
      return;
    }
    
    // Validate file size (max 2MB)
    if (fileSize > 2) {
      setError('La imagen no debe exceder 2MB');
      return;
    }

    try {
      setError(null);
      setUploading(true);
      
      // Generate a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = organizationId 
        ? `organizations/${organizationId}/logo_${fileName}`
        : `organizations/temp/logo_${fileName}`;

      // Upload to Supabase Storage using utility function
      const uploadedPath = await uploadFileToStorage(file, filePath, 'logos');

      // Use storage path instead of public URL
      setLogo(uploadedPath);
      onLogoChange(uploadedPath);
    } catch (err: any) {
      console.error('Error uploading logo:', err);
      setError('Error al subir la imagen. Intenta nuevamente.');
    } finally {
      setUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = async () => {
    try {
      // If there's a logo and it's a storage path (not a URL), delete from storage
      if (logo && !logo.startsWith('http')) {
        await deleteFileFromStorage(logo, 'logos');
      }
    } catch (err: any) {
      console.error('Error deleting logo from storage:', err);
      // Continue with local removal even if storage deletion fails
    }
    
    setLogo(null);
    onLogoChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="mb-2 text-sm font-medium text-gray-700">Logo de la organización</div>
      
      <div 
        className="relative group cursor-pointer"
        onClick={handleClick}
      >
        {logo ? (
          <div className="relative w-32 h-32 rounded-full border-2 border-gray-200 overflow-hidden">
            <StorageImage 
              src={logo} 
              alt="Logo de la organización" 
              fill 
              style={{ objectFit: 'cover' }}
              className="rounded-full"
              bucketName="logos"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
              <span className="text-white opacity-0 group-hover:opacity-100">Cambiar</span>
            </div>
          </div>
        ) : (
          <div className="w-32 h-32 rounded-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="mt-2 text-sm text-gray-500">Subir logo</span>
          </div>
        )}
        
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-full">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
      
      {logo && (
        <button 
          type="button" 
          onClick={handleRemove}
          className="mt-2 text-sm text-red-600 hover:text-red-800"
        >
          Eliminar logo
        </button>
      )}
      
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
