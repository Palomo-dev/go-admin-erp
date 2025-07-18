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
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div className="flex items-center gap-2">
        <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Facturas de Venta</h1>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-2">
        <Button 
          variant="outline" 
          className="flex items-center gap-2 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
        >
          <Download size={18} />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 dark:bg-blue-700 dark:hover:bg-blue-600"
          onClick={handleNuevaFactura}
        >
          <Plus size={18} />
          <span>Nueva Factura</span>
        </Button>
      </div>
    </div>
  );
}
