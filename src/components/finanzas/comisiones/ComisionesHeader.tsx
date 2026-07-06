'use client';

import { Percent } from 'lucide-react';

export function ComisionesHeader() {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Percent className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          Comisiones
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestión y seguimiento de comisiones generadas
        </p>
      </div>
    </div>
  );
}
