"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { Proveedor, FiltrosProveedores as FiltrosProveedoresType } from './types';
import { supabase } from '@/lib/supabase/config';
import { Button } from "@/components/ui/button";
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService } from '@/lib/services/supplierService';

// Importaciones de los componentes creados
import ProveedoresPageHeader from './ProveedoresPageHeader';
import FiltrosProveedores from '@/components/inventario/proveedores/FiltrosProveedores';
import ProveedoresTable from './ProveedoresTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Componente principal para el catálogo de proveedores
 * 
 * Este componente orquesta la visualización y gestión de proveedores,
 * incluyendo listado, filtrado, creación, edición y visualización de detalles.
 */
const CatalogoProveedores: React.FC = () => {
  const { theme } = useTheme();
  const router = useRouter();
  
  // Estados
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filters, setFilters] = useState<FiltrosProveedoresType>({
    busqueda: '',
    estado: '',
    ordenarPor: 'name'
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [proveedorToDelete, setProveedorToDelete] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<boolean>(false);

  // Cargar proveedores desde Supabase
  useEffect(() => {
    const fetchProveedores = async () => {
      try {
        setLoading(true);
        
        // Obtener el ID de organización usando la función estándar del sistema
        const organizationId = getOrganizationId();
        
        console.log('🔍 Buscando proveedores para organization_id:', organizationId);
        
        // Consulta básica a la tabla de proveedores filtrada por organization_id
        let query = supabase
          .from('suppliers')
          .select('*')
          .eq('organization_id', organizationId);
        
        // Aplicar filtros si existen
        if (filters.busqueda) {
          query = query.or(`name.ilike.%${filters.busqueda}%,email.ilike.%${filters.busqueda}%,nit.ilike.%${filters.busqueda}%`);
        }
        
        // Ordenar resultados
        query = query.order(filters.ordenarPor || 'name', { ascending: true });
        
        const { data, error } = await query;
        
        console.log('📦 Proveedores encontrados:', data?.length || 0);
        console.log('🔍 Datos recibidos:', data);
        
        if (error) {
          console.error('❌ Error al cargar proveedores:', error);
          throw error;
        }
        
        // Transformar los datos a nuestro formato de interfaz
        const proveedoresData = data.map((p: any): Proveedor => ({
          id: p.id,
          uuid: p.uuid,
          organization_id: p.organization_id,
          name: p.name,
          nit: p.nit || '',
          contact: p.contact || '',
          phone: p.phone || '',
          email: p.email || '',
          notes: p.notes || '',
          created_at: p.created_at,
          updated_at: p.updated_at,
          // Datos de ejemplo para UI - en producción estos vendrían de otras tablas
          condiciones_pago: {
            dias_credito: 30,
            limite_credito: 5000000,
            metodo_pago_preferido: 'Transferencia'
          },
          cumplimiento: Math.floor(Math.random() * 100) // Solo para demostración
        }));
        
        setProveedores(proveedoresData);
      } catch (error) {
        console.error('Error al cargar proveedores:', error);
        toast({
          title: "Error",
          description: "No se pudieron cargar los proveedores",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchProveedores();
  }, [filters]);

  // Función para duplicar proveedor
  const handleDuplicate = async (uuid: string) => {
    try {
      setIsDuplicating(true);
      const organizationId = getOrganizationId();
      
      const { data, error } = await supplierService.duplicateSupplier(uuid, organizationId);
      
      if (error) throw error;
      
      toast({
        title: "Éxito",
        description: "Proveedor duplicado correctamente",
      });
      
      // Redirigir a editar el nuevo proveedor
      if (data) {
        router.push(`/app/inventario/proveedores/${data.uuid}/editar`);
      }
    } catch (error) {
      console.error('Error duplicando proveedor:', error);
      toast({
        title: "Error",
        description: "No se pudo duplicar el proveedor",
        variant: "destructive",
      });
    } finally {
      setIsDuplicating(false);
    }
  };

  // Función para confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!proveedorToDelete) return;
    
    try {
      const organizationId = getOrganizationId();
      const { success, error } = await supplierService.deleteSupplier(proveedorToDelete, organizationId);
      
      if (error) throw error;
      
      toast({
        title: "Éxito",
        description: "Proveedor eliminado correctamente",
      });
      
      setProveedores(proveedores.filter(p => p.uuid !== proveedorToDelete));
      setDeleteDialogOpen(false);
      setProveedorToDelete(null);
    } catch (error) {
      console.error('Error eliminando proveedor:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el proveedor",
        variant: "destructive",
      });
    }
  };

  // Función para mostrar diálogo de eliminación
  const handleDelete = (uuid: string) => {
    setProveedorToDelete(uuid);
    setDeleteDialogOpen(true);
  };

  // Función para exportar proveedores
  const handleExport = async () => {
    try {
      const organizationId = getOrganizationId();
      const csv = await supplierService.exportSuppliersToCSV(organizationId);
      
      if (!csv) {
        toast({
          variant: 'destructive',
          title: 'Sin datos',
          description: 'No hay proveedores para exportar'
        });
        return;
      }

      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `proveedores_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación completada',
        description: 'El archivo CSV ha sido descargado'
      });
    } catch (error) {
      console.error('Error exportando:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo exportar los proveedores'
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6 text-gray-800 dark:text-gray-200">
      <ProveedoresPageHeader 
        onNuevoProveedor={() => router.push('/app/inventario/proveedores/nuevo')}
        onExport={handleExport}
      />
      
      <FiltrosProveedores 
        filters={filters} 
        setFilters={setFilters} 
      />
      
      {loading || isDuplicating ? (
        <div className="flex justify-center items-center py-8 sm:py-10">
          <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-blue-600 dark:text-blue-400" />
          {isDuplicating && <span className="ml-2 text-gray-500">Duplicando...</span>}
        </div>
      ) : (
        <ProveedoresTable 
          proveedores={proveedores}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      )}

      {/* Diálogo de confirmación para eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              ¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CatalogoProveedores;
