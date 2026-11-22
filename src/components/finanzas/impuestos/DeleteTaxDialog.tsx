"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('finanzasImpuestos.eliminar');

  const handleDelete = async () => {
    setLoading(true);
    try {
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
        
        // El servidor dice por qué (predeterminado, en uso en N productos, sin permiso).
        toast({ title: t('errorTitulo'), description: data.message || t('error'), variant: 'destructive' });
        return;
      }
      
      // Operación exitosa
      toast({ description: data?.message || t('hecho') });
      
      onClose(true); // Cerrar el diálogo y refrescar la lista de impuestos
    } catch (error) {
      console.error('Error al eliminar el impuesto:', error);
      toast({ title: t('errorTitulo'), description: t('error'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Diálogo del manual (PATRONES §8) con el primario destructivo; los textos no cambian.
  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={(v) => !v && !loading && onClose()}
      titulo={t('titulo', { nombre: tax.name })}
      descripcion={t.rich('descripcion', {
        nombre: tax.name,
        tasa: formatPercent(tax.rate),
        b: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong>,
      })}
      ancho={440}
      primario={{ etiqueta: t('confirmar'), onClick: () => void handleDelete(), destructiva: true, cargando: loading }}
    />
  );
};

export default DeleteTaxDialog;
