'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, ArrowLeft, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function PageBackHeader() {
  // Usamos el router para la navegación
  const router = useRouter();

  // Función para volver a la página anterior
  const handleBack = () => {
    router.back();
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleBack}
          className="
            p-2 h-auto min-w-[36px] sm:min-w-[40px]
            hover:bg-gray-100 dark:hover:bg-gray-700
            rounded-lg
            transition-colors
          "
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
        </Button>
        <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          Nueva Factura de Venta
        </h1>
      </div>
    </div>
  );
}
