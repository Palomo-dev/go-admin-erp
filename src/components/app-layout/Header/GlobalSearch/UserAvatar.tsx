'use client';

import React from 'react';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

/**
 * Componente que muestra un avatar, ya sea una imagen o iniciales con color
 */
export const UserAvatar = ({ name, avatarUrl, className = '', size = 'sm' }: AvatarProps) => {
  // Generar iniciales a partir del nombre (máximo 2 caracteres)
  const getInitials = () => {
    if (!name) return '?';
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase();
    return (nameParts[0].charAt(0) + nameParts[1].charAt(0)).toUpperCase();
  };

  // Generar un color consistente basado en el nombre
  const getColor = () => {
    if (!name) return '#6B7280'; // Un gris por defecto
    
    // Lista de colores para los avatares
    const colors = [
      '#3B82F6', // azul
      '#10B981', // verde
      '#F59E0B', // amarillo
      '#EF4444', // rojo
      '#8B5CF6', // morado
      '#EC4899', // rosa
      '#06B6D4', // cyan
      '#F97316', // naranja
    ];
    
    // Usar la suma de los códigos ASCII como una forma simple de hash
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash += name.charCodeAt(i);
    }
    
    // Obtener un color de la lista basado en el hash
    return colors[hash % colors.length];
  };

  // Tamaños para las clases CSS
  const sizeClasses = {
    xs: 'w-5 h-5 text-xs',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  // Si hay una URL de avatar, mostrar la imagen
  if (avatarUrl) {
    return (
      <img 
        src={avatarUrl} 
        alt={`Avatar de ${name}`}
        className={`rounded-full object-cover ${sizeClasses[size]} ${className}`}
        onError={(e) => {
          // Si hay error al cargar la imagen, mostrar iniciales
          const target = e.currentTarget as HTMLImageElement;
          target.style.display = 'none';
          const fallbackElement = target.parentElement?.querySelector('.fallback-avatar') as HTMLElement;
          if (fallbackElement) {
            fallbackElement.style.display = 'flex';
          }
        }}
      />
    );
  }

  // Si no hay URL, mostrar iniciales con color de fondo
  return (
    <div 
      className={`fallback-avatar flex items-center justify-center rounded-full font-medium text-white ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: getColor() }}
    >
      {getInitials()}
    </div>
  );
};
