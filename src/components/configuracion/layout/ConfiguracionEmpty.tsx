'use client';

import { Settings } from 'lucide-react';

interface ConfiguracionEmptyProps {
  title?: string;
  description?: string;
}

export function ConfiguracionEmpty({ title, description }: ConfiguracionEmptyProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <Settings className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h3 className="text-lg font-medium text-muted-foreground">
        {title ?? 'No hay configuraciones disponibles'}
      </h3>
      <p className="text-sm text-muted-foreground/70 mt-1 max-w-md">
        {description ?? 'Activa módulos en la sección de Organización para ver sus configuraciones aquí.'}
      </p>
    </div>
  );
}
