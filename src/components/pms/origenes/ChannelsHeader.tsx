'use client';

import React from 'react';
import { Share2 } from 'lucide-react';

export function ChannelsHeader() {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex-shrink-0">
          <Share2 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Canales de Reserva
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            Gestión de orígenes y comisiones por canal
          </p>
        </div>
      </div>
    </div>
  );
}
