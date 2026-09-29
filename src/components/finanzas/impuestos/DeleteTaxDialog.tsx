"use client";

import React, { useState } from 'react';
import { Dialogo } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
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

  // Diálogo del manual (PATRONES §8) con el primario destructivo; los textos no cambian.
  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={(v) => !v && !loading && onClose()}
      titulo="Eliminar impuesto"
      descripcion={
        <>
          ¿Está seguro de que desea eliminar el impuesto <strong className="font-semibold text-fg">{tax.name}</strong> ({formatPercent(tax.rate)})? Esta
          acción no se puede deshacer. El impuesto será eliminado permanentemente.
        </>
      }
      ancho={440}
      primario={{ etiqueta: 'Eliminar', onClick: () => void handleDelete(), destructiva: true, cargando: loading }}
    />
  );
};

export default DeleteTaxDialog;
