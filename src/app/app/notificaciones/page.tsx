/**
 * Página principal del módulo de notificaciones
 * Integra el NotificacionesManager con toda la funcionalidad completa
 */

'use client';

import React from 'react';
import { NotificacionesManager } from '@/components/app/notificaciones';

/**
 * Página de notificaciones con funcionalidad completa
 */
export default function NotificacionesPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header de la página */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Notificaciones
        </h1>
        <p className="text-muted-foreground">
          Gestiona tus notificaciones y alertas del sistema en tiempo real
        </p>
      </div>
      
      <div className="space-y-6 min-h-0">
        {/* Componente principal de notificaciones */}
        <NotificacionesManager 
          showRealtime={true}
          showBreadcrumb={true}
        />
      </div>
    </div>
  );
}
