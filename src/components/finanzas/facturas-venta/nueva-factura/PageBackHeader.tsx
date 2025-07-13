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
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          onClick={handleBack}
          className="p-0 h-auto hover:bg-transparent"
        >
          <ArrowLeft className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
        </Button>
        <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nueva Factura de Venta</h1>
      </div>
    </div>
  );
}
