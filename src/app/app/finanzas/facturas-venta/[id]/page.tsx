'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DetalleFactura from '@/components/finanzas/facturas-venta/id/DetalleFactura';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileX2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function FacturaDetallesPage({ params }: PageProps) {
  const { id: invoiceId } = React.use(params);
  const router = useRouter();
  
  const [factura, setFactura] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const organizationId = getOrganizationId();

  useEffect(() => {
    const cargarFactura = async () => {
      if (!organizationId || !invoiceId) {
        setLoading(false);
        return;
      }
      
      try {
        // Obtener la factura
        const { data: facturaData, error: facturaError } = await supabase
          .from('invoice_sales')
          .select('*, customers(id, full_name, email, phone)')
          .eq('id', invoiceId)
          .eq('organization_id', organizationId)
          .single();

        // PGRST116 = no rows found (factura no existe o fue eliminada)
        if (facturaError) {
          if (facturaError.code === 'PGRST116' || facturaError.message?.includes('0 rows')) {
            setNotFound(true);
            return;
          }
          throw facturaError;
        }
        if (!facturaData) {
          setNotFound(true);
          return;
        }

        // Obtener los items de la factura con información de productos
        const { data: itemsData, error: itemsError } = await supabase
          .from('invoice_items')
          .select('*, products(id, name, sku, description)')
          .eq('invoice_sales_id', invoiceId)
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
        
        // Obtener el nombre del vendedor si existe
        let salespersonName = null;
        if (facturaData.salesperson_id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', facturaData.salesperson_id)
            .single();
          
          if (profileData) {
            salespersonName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim();
          }
        }
        
        // Combinar todos los datos
        const facturaCompleta = {
          ...facturaData,
          items: itemsData || [],
          pagos: pagosData || [],
          salesperson_name: salespersonName
        };
        
        setFactura(facturaCompleta);
      } catch (error: any) {
        console.error('Error al cargar la factura:', error);
        toastError('Error al cargar la factura', error.message || 'No se pudo cargar la información de la factura');
      } finally {
        setLoading(false);
      }
    };

    cargarFactura();
  }, [invoiceId, organizationId]);

  if (loading) {
    return (
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-10 sm:h-12 w-full sm:w-3/4" />
        <Skeleton className="h-48 sm:h-64 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <Skeleton className="h-28 sm:h-32 w-full" />
          <Skeleton className="h-28 sm:h-32 w-full" />
        </div>
      </div>
    );
  }

  if (notFound || !factura) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 sm:p-6 text-center">
        <FileX2 className="h-12 w-12 sm:h-16 sm:w-16 text-gray-400 dark:text-gray-600 mb-4" />
        <h2 className="text-lg sm:text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Factura no encontrada
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          La factura que buscas pudo haber sido eliminada o no pertenece a tu organización.
        </p>
        <Button
          onClick={() => router.push('/app/finanzas/facturas-venta')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a facturas
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 md:py-6 max-w-7xl">
      <DetalleFactura factura={factura} />
    </div>
  );
}
