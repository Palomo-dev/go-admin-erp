"use client";

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { formatPercent } from '@/utils/Utils';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface OrganizationTax {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
}

interface DeleteTaxDialogProps {
  open: boolean;
  onClose: (deleted?: boolean) => void;
  tax: OrganizationTax;
}

const DeleteTaxDialog: React.FC<DeleteTaxDialogProps> = ({ open, onClose, tax }) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Verificar si el impuesto está siendo utilizado
  const checkTaxUsage = async () => {
    try {
      // Verificar relaciones con productos
      const { count, error } = await supabase
        .from('product_tax_relations')
        .select('*', { count: 'exact' })
        .eq('tax_id', tax.id);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error al verificar uso del impuesto:', error);
      return 0;
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      console.log('Eliminando impuesto con ID:', tax.id);
      
      // Obtener el ID de la organización
      const organizationId = getOrganizationId();
      
      // Usar la función RPC con SECURITY DEFINER para eliminar el impuesto
      const { data, error } = await supabase.rpc(
        'delete_organization_tax',
        {
          p_tax_id: tax.id,
          p_organization_id: organizationId
        }
      );
      
      if (error) {
        console.error('Error detallado al eliminar impuesto:', { 
          code: error.code, 
          message: error.message, 
          details: error.details 
        });
        throw error;
      }
      
      // Verificar la respuesta de la función RPC
      if (data && !data.success) {
        // La función RPC devolvió un error de lógica de negocio
        console.error('Error de validación:', data.message, 'Código:', data.code);
        
        toast({
          title: 'Error',
          description: data.message || 'No se pudo eliminar el impuesto.',
          variant: 'destructive',
        });
        return;
      }
      
      // Operación exitosa
      toast({
        title: 'Éxito',
        description: data?.message || 'Impuesto eliminado correctamente.',
      });
      
      onClose(true); // Cerrar el diálogo y refrescar la lista de impuestos
    } catch (error) {
      console.error('Error al eliminar el impuesto:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el impuesto. Intente de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={() => !loading && onClose()}>
      <AlertDialogContent className="bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-600 dark:text-red-400">
            Eliminar Impuesto
          </AlertDialogTitle>
          <AlertDialogDescription className="dark:text-gray-300">
            ¿Está seguro de que desea eliminar el impuesto <strong>{tax.name}</strong> ({formatPercent(tax.rate)})?
            <br /><br />
            Esta acción no se puede deshacer. El impuesto será eliminado permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} className="dark:border-gray-700 dark:hover:bg-gray-700">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Eliminando...
              </>
            ) : (
              'Eliminar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteTaxDialog;
