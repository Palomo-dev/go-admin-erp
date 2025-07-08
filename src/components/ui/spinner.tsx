import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }[size];
  
  return (
    <div 
      className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClass} ${className}`}
      aria-label="Cargando..."
    />
  );
}
