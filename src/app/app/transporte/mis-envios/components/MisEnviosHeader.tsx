'use client';

import { Truck } from 'lucide-react';

export function MisEnviosHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Truck className="h-6 w-6 text-blue-600" />
          Mis Envíos
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestiona tus entregas asignadas
        </p>
      </div>
    </div>
  );
}
