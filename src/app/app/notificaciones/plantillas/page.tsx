'use client';

import { TemplateManager } from '@/components/notificaciones/plantillas/TemplateManager';

export default function PlantillasPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Plantillas de Mensajes
          </h1>
          <p className="text-muted-foreground">
            Crea y gestiona plantillas de mensajes con variables dinámicas para diferentes canales de comunicación
          </p>
        </div>
        
        <TemplateManager />
      </div>
    </div>
  );
}
