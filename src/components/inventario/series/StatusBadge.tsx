'use client';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Función local para combinar clases CSS
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type SerialStatus = 'En stock' | 'Vendida' | 'Garantía';

interface StatusBadgeProps {
  status: SerialStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  // Definir los estilos según el estado
  const getStatusStyle = () => {
    switch (status) {
      case 'En stock':
        return 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/40';
      case 'Vendida':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/40';
      case 'Garantía':
        return 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/40';
      default:
        return 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:hover:bg-slate-900/40';
    }
  };

  return (
    <Badge 
      variant="outline"
      className={cn(getStatusStyle(), className)}
    >
      {status}
    </Badge>
  );
}
