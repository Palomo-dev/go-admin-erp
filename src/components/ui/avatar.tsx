'use client';

import * as React from 'react';
import { cn } from '@/utils/Utils';

interface AvatarProps {
  className?: string;
  children?: React.ReactNode;
}

export const Avatar: React.FC<AvatarProps> = ({ className, children }) => (
  <div className={cn(
    "flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
    className
  )}>
    {children}
  </div>
);

interface AvatarImageProps {
  src?: string;
  alt?: string;
  className?: string;
}

export const AvatarImage: React.FC<AvatarImageProps> = ({ src, alt = "", className }) => {
  const [error, setError] = React.useState(false);
  
  if (error || !src) return null;
  
  return (
    <img 
      src={src} 
      alt={alt} 
      onError={() => setError(true)}
      className={cn("aspect-square h-full w-full", className)}
    />
  );
};

interface AvatarFallbackProps {
  className?: string;
  children?: React.ReactNode;
}

export const AvatarFallback: React.FC<AvatarFallbackProps> = ({ className, children }) => (
  <div className={cn(
    "flex h-full w-full items-center justify-center rounded-full bg-muted",
    className
  )}>
    {children}
  </div>
);
