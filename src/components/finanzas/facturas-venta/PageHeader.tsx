'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Download, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export function PageHeader() {
  // Usamos el router para la navegación
  const router = useRouter();

  // Función para manejar la creación de nueva factura
  const handleNuevaFactura = () => {
    try {
      // Obtener el ID de la organización activa
      const organizationId = getOrganizationId();
      
      // Verificar que hay una organización activa
      if (!organizationId) {
        toast({
          title: "Error",
          description: "No se pudo determinar la organización activa. Por favor, seleccione una organización.",
          variant: "destructive",
        });
        return;
      }
      
      // Navegar a la página de creación de factura
      router.push(`/app/finanzas/facturas-venta/nuevo`);
    } catch (error) {
      console.error('Error al crear nueva factura:', error);
      toast({
        title: "Error",
        description: "Ocurrió un error al intentar crear una nueva factura. Por favor, inténtelo de nuevo.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
      {/* Título con icono */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          Facturas de Venta
        </h1>
      </div>
      
      {/* Botones de acción */}
      <div className="flex flex-row gap-2 w-full sm:w-auto">
        <Button 
          variant="outline" 
          size="sm"
          className="
            flex items-center justify-center gap-2 flex-1 sm:flex-initial
            bg-white dark:bg-gray-800 
            border-gray-300 dark:border-gray-600
            hover:bg-gray-50 dark:hover:bg-gray-700
            text-gray-700 dark:text-gray-200
            transition-colors
          "
        >
          <Download className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">Exportar</span>
        </Button>
        <Button 
          size="sm"
          className="
            flex items-center justify-center gap-2 flex-1 sm:flex-initial
            bg-blue-600 hover:bg-blue-700 
            dark:bg-blue-600 dark:hover:bg-blue-500
            text-white
            shadow-sm hover:shadow-md
            transition-all
          "
          onClick={handleNuevaFactura}
        >
          <Plus className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">Nueva Factura</span>
        </Button>
      </div>
    </div>
  );
}
