'use client';

import { useMemo } from 'react';
import Image, { ImageProps } from 'next/image';
import { getStoragePublicUrl } from '@/lib/utils/storage';

interface StorageImageProps extends Omit<ImageProps, 'src'> {
  src: string | null;
  bucketName?: string;
  fallbackSrc?: string;
}

/**
 * Image component that automatically converts storage paths to public URLs
 * Supports both storage paths and full URLs
 */
export default function StorageImage({ 
  src, 
  bucketName = 'logos', 
  fallbackSrc,
  alt,
  ...props 
}: StorageImageProps) {
  const publicUrl = useMemo(() => {
    const url = getStoragePublicUrl(src, bucketName);
    return url || fallbackSrc || '';
  }, [src, bucketName, fallbackSrc]);

  if (!publicUrl) {
    return null;
  }

  return (
    <Image 
      src={publicUrl}
      alt={alt}
      {...props}
    />
  );
}
