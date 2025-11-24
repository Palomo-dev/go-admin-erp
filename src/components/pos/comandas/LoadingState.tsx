'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cargando comandas...
        </p>
      </div>
    </div>
  );
}
