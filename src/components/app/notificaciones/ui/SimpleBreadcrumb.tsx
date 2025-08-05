/**
 * Breadcrumb simple para notificaciones
 * Implementación básica sin dependencias complejas
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils/Utils';
import { ChevronRight, Home, Bell } from 'lucide-react';

interface SimpleBreadcrumbProps {
  className?: string;
}

export function SimpleBreadcrumb({ className }: SimpleBreadcrumbProps) {
  const router = useRouter();

  return (
    <nav className={cn('flex items-center space-x-2 text-sm text-muted-foreground', className)}>
      <button
        onClick={() => router.push('/app')}
        className="flex items-center space-x-1 hover:text-foreground transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>Inicio</span>
      </button>
      
      <ChevronRight className="w-4 h-4" />
      
      <span className="flex items-center space-x-1 text-foreground font-medium">
        <Bell className="w-4 h-4" />
        <span>Notificaciones</span>
      </span>
    </nav>
  );
}
