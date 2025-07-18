'use client';

import React from 'react';
import { Package } from 'lucide-react';

interface ProductImageProps {
  name: string;
  imagePath?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

/**
 * Componente para mostrar imagen de producto con fallback
 */
export const ProductImage = ({ name, imagePath, className = '', size = 'sm' }: ProductImageProps) => {
  // Tamaños para las clases CSS
  const sizeClasses = {
    xs: 'w-5 h-5',
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12'
  };

  // Si hay una ruta de imagen, intentar mostrar la imagen
  if (imagePath) {
    return (
      <div className={`relative ${sizeClasses[size]} ${className}`}>
        <img 
          src={imagePath} 
          alt={`Imagen de ${name}`}
          className="rounded-md object-cover w-full h-full"
          onError={(e) => {
            // Si hay error al cargar la imagen, mostrar icono
            const target = e.currentTarget as HTMLImageElement;
            target.style.display = 'none';
            const fallbackElement = target.nextElementSibling as HTMLElement;
            if (fallbackElement) {
              fallbackElement.style.display = 'flex';
            }
          }}
        />
        <div 
          className="fallback-image hidden absolute inset-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800"
        >
          <Package className="text-gray-500 dark:text-gray-400" size={size === 'xs' ? 14 : size === 'sm' ? 16 : 20} />
        </div>
      </div>
    );
  }

  // Si no hay imagen, mostrar icono de producto
  return (
    <div 
      className={`flex items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 ${sizeClasses[size]} ${className}`}
    >
      <Package className="text-gray-500 dark:text-gray-400" size={size === 'xs' ? 14 : size === 'sm' ? 16 : 20} />
    </div>
  );
};
