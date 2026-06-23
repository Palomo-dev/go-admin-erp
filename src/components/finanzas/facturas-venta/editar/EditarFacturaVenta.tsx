'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, ArrowLeft, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { NuevaFacturaForm } from '../nueva-factura/NuevaFacturaForm';
import { useToast } from '@/components/ui/use-toast';

interface EditarFacturaVentaProps {
  facturaId: string;
}

export function EditarFacturaVenta({ facturaId }: EditarFacturaVentaProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [factura, setFactura] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const organizationId = getOrganizationId();

  useEffect(() => {
    cargarFactura();
  }, [facturaId]);

  const cargarFactura = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!organizationId || !facturaId) {
        setError('Faltan datos para cargar la factura.');
        return;
      }

      const { data: facturaData, error: facturaError } = await supabase
        .from('invoice_sales')
        .select('*')
        .eq('id', facturaId)
        .eq('organization_id', organizationId)
        .single();

      if (facturaError) throw facturaError;
      if (!facturaData) throw new Error('Factura no encontrada');

      if (facturaData.status !== 'draft') {
        setError(`No se puede editar una factura en estado "${facturaData.status}". Solo las facturas en borrador pueden editarse.`);
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_sales_id', facturaId)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;

      setFactura({
        ...facturaData,
        items: itemsData || []
      });
    } catch (error: any) {
      console.error('Error cargando factura:', error);
      setError(error.message || 'Error al cargar la factura');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (datosFactura: any) => {
    if (!factura) return;

    try {
      setSaving(true);

      // Calcular el balance: total nuevo - pagos ya realizados
      // Usar Number() para asegurar aritmética correcta (Supabase devuelve numeric como string)
      const totalActual = Number(factura.total) || 0;
      const balanceActual = Number(factura.balance) || 0;
      const pagosRealizados = totalActual - balanceActual;
      const nuevoBalance = Number(datosFactura.total) - pagosRealizados;

      const { error: updateError } = await supabase
        .from('invoice_sales')
        .update({
          number: datosFactura.number,
          customer_id: datosFactura.customer_id,
          branch_id: datosFactura.branch_id,
          issue_date: datosFactura.issue_date,
          due_date: datosFactura.due_date,
          currency: datosFactura.currency,
          payment_terms: Number(datosFactura.payment_terms) || 0,
          payment_method: datosFactura.payment_method,
          notes: datosFactura.notes,
          tax_included: datosFactura.tax_included,
          subtotal: Number(datosFactura.subtotal) || 0,
          tax_total: Number(datosFactura.tax_total) || 0,
          total: Number(datosFactura.total) || 0,
          balance: nuevoBalance
        })
        .eq('id', factura.id);

      if (updateError) throw updateError;

      const { data: existingItems, error: fetchItemsError } = await supabase
        .from('invoice_items')
        .select('id')
        .eq('invoice_sales_id', factura.id);

      if (fetchItemsError) throw fetchItemsError;

      const existingIds = (existingItems || []).map(i => i.id);
      const newItemIds = datosFactura.items.filter((i: any) => i.id).map((i: any) => i.id);
      const idsToDelete = existingIds.filter(id => !newItemIds.includes(id));

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('invoice_items')
          .delete()
          .in('id', idsToDelete)
          .eq('invoice_sales_id', factura.id);

        if (deleteError) throw deleteError;
      }

      for (const item of datosFactura.items) {
        const itemData = {
          invoice_sales_id: factura.id,
          invoice_id: factura.id,
          invoice_type: 'sale',
          product_id: item.product_id || null,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_code: item.tax_code || null,
          tax_rate: item.tax_rate || 0,
          tax_included: item.tax_included || false,
          total_line: item.total_line,
          discount_amount: item.discount_amount || 0
        };

        if (item.id) {
          const { error: updateItemError } = await supabase
            .from('invoice_items')
            .update(itemData)
            .eq('id', item.id)
            .eq('invoice_sales_id', factura.id);

          if (updateItemError) throw updateItemError;
        } else {
          const { error: insertItemError } = await supabase
            .from('invoice_items')
            .insert(itemData);

          if (insertItemError) throw insertItemError;
        }
      }

      if (factura.sale_id) {
        const { error: saleUpdateError } = await supabase
          .from('sales')
          .update({
            customer_id: datosFactura.customer_id,
            branch_id: datosFactura.branch_id,
            subtotal: Number(datosFactura.subtotal) || 0,
            tax_total: Number(datosFactura.tax_total) || 0,
            total: Number(datosFactura.total) || 0,
            balance: nuevoBalance
          })
          .eq('id', factura.sale_id);

        if (saleUpdateError) {
          console.error('Error al actualizar venta:', saleUpdateError);
        }
      }

      toast({
        title: 'Factura actualizada',
        description: 'La factura de venta se ha actualizado correctamente.',
      });

      router.push(`/app/finanzas/facturas-venta/${factura.id}`);
    } catch (error: any) {
      console.error('Error actualizando factura:', error);
      toast({
        title: 'Error al actualizar',
        description: error.message || 'Error al actualizar la factura',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-8 w-64" />
          </div>
        </div>
        <Card className="
          p-3 sm:p-4 lg:p-6
          bg-white dark:bg-gray-800
          border-gray-200 dark:border-gray-700
          shadow-sm
          w-full
          overflow-hidden
        ">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="p-2 h-auto min-w-[36px] sm:min-w-[40px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            </Button>
            <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              Editar Factura
            </h1>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {error.includes('No se puede editar') ?
              'La factura no puede ser editada en su estado actual.' :
              'No se pudo cargar la información de la factura.'}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="default" onClick={cargarFactura}>
              Intentar de nuevo
            </Button>
            <Button variant="outline" onClick={() => router.push(`/app/finanzas/facturas-venta/${facturaId}`)}>
              Volver al detalle
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (factura) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
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
              Editar Factura de Venta
            </h1>
          </div>
        </div>
        <Card className="
          p-3 sm:p-4 lg:p-6
          bg-white dark:bg-gray-800
          border-gray-200 dark:border-gray-700
          shadow-sm
          w-full
          overflow-hidden
        ">
          <NuevaFacturaForm
            facturaInicial={factura}
            onSubmit={handleSubmit}
            saving={saving}
            esEdicion={true}
          />
        </Card>
      </div>
    );
  }

  return null;
}
