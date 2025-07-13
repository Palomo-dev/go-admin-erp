'use client';

import React, { useEffect, useState } from 'react';
import { DetalleFactura } from '@/components/finanzas/facturas-venta/id/DetalleFactura';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { useParams } from 'next/navigation';

export default function FacturaDetallesPage() {
  // Usar useParams() para acceder a los parámetros de forma segura
  const params = useParams();
  const invoiceId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  
  const [factura, setFactura] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  useEffect(() => {
    const cargarFactura = async () => {
      if (!organizationId || !invoiceId) return;
      
      try {
        // Obtener la factura
        const { data: facturaData, error: facturaError } = await supabase
          .from('invoice_sales')
          .select('*, customers(id, full_name, email, phone)')
          .eq('id', invoiceId)
          .eq('organization_id', organizationId)
          .single();

        if (facturaError) throw facturaError;
        if (!facturaData) throw new Error('No se encontró la factura');

        // Obtener los items de la factura - usando tax_templates en lugar de taxes
        const { data: itemsData, error: itemsError } = await supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', invoiceId)
          .order('id', { ascending: true });

        if (itemsError) throw itemsError;
        
        // Obtener los pagos aplicados a la factura
        const { data: pagosData, error: pagosError } = await supabase
          .from('payments')
          .select('*')
          .eq('source', 'invoice_sales')
          .eq('source_id', invoiceId)
          .order('created_at', { ascending: false });

        if (pagosError) throw pagosError;
        
        // Combinar todos los datos
        const facturaCompleta = {
          ...facturaData,
          items: itemsData || [],
          pagos: pagosData || []
        };
        
        setFactura(facturaCompleta);
      } catch (error: any) {
        console.error('Error al cargar la factura:', error);
        toast({
          title: 'Error al cargar la factura',
          description: error.message || 'No se pudo cargar la información de la factura',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    cargarFactura();
  }, [invoiceId, organizationId, toast]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="p-6 text-center">
        <p className="text-xl text-red-500">No se encontró la factura solicitada</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <DetalleFactura factura={factura} />
    </div>
  );
}
