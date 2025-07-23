'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { PlusCircle, AlertCircle } from 'lucide-react';
import { RegistrarPagoDialog } from '@/components/finanzas/facturas-venta/id/RegistrarPagoDialog';

interface PagosFacturaProps {
  facturaId: string; // UUID
  factura?: any; // Objeto de factura para determinar saldo
}

interface Pago {
  id: number;
  created_at: string;
  method: string;
  amount: number;
  currency: string;
  reference: string;
  status: string;
}

export function PagosFactura({ facturaId, factura }: PagosFacturaProps) {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPagado, setTotalPagado] = useState(0);
  const [moneda, setMoneda] = useState('COP');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [facturaCompleta, setFacturaCompleta] = useState<any>(factura);

  useEffect(() => {
    if (facturaId) {
      cargarPagos();
    }
  }, [facturaId]);

  const cargarPagos = async () => {
    setCargando(true);
    setError(null);
    
    try {
      const organizationId = getOrganizationId();
      
      // Primero obtener la información completa de la factura si no la tenemos
      if (!facturaCompleta) {
        const { data: facturaData, error: facturaError } = await supabase
          .from('invoice_sales')
          .select('*')
          .eq('id', facturaId)
          .eq('organization_id', organizationId)
          .single();
        
        if (facturaError) throw facturaError;
        setFacturaCompleta(facturaData);
        if (facturaData?.currency) {
          setMoneda(facturaData.currency);
        }
      } else {
        // Usar la moneda de la factura que ya tenemos
        if (facturaCompleta?.currency) {
          setMoneda(facturaCompleta.currency);
        }
      }

    // Cargar todos los pagos asociados a esta factura usando RPC
    // Incluye tanto pagos directos como pagos a cuentas por cobrar vinculadas
    const { data: pagosData, error: pagosError } = await supabase
      .rpc('get_invoice_payments', {
        target_invoice_id: facturaId,
        org_id: organizationId
      });

    if (pagosError) throw pagosError;

    setPagos(pagosData || []);
      
      // Calcular total pagado
      if (pagosData?.length > 0) {
        const total = pagosData
          .filter((pago: any) => pago.status === 'completed')
          .reduce((sum: number, pago: any) => sum + (pago.amount || 0), 0);
        setTotalPagado(total);
      }
    } catch (err: any) {
      console.error('Error al cargar pagos de la factura:', err);
      setError(`Error al cargar los pagos: ${err.message}`);
    } finally {
      setCargando(false);
    }
  };

  const getPaymentMethodName = (method: string) => {
    const methods: Record<string, string> = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'check': 'Cheque',
      'credit': 'Crédito',
      'stripe': 'Stripe',
      'paypal': 'PayPal',
      'mp': 'MercadoPago',
      'other': 'Otro'
    };
    
    return methods[method] || method;
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Completado</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Pendiente</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Fallido</Badge>;
      case 'refunded':
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">Reembolsado</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300">
          Pagos Asociados
        </h3>
        {/* Solo mostrar el botón si hay saldo pendiente */}
        {facturaCompleta && facturaCompleta.balance > 0 && (
          <Button 
            variant="outline"
            size="sm"
            className="flex items-center gap-2 dark:bg-gray-800 dark:border-gray-700"
            onClick={() => setDialogOpen(true)}
          >
            <PlusCircle size={16} />
            <span>Registrar Pago</span>
          </Button>
        )}
      </div>

      {/* Mostrar total pagado */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800">
        <div className="flex justify-between items-center">
          <span className="text-sm text-blue-700 dark:text-blue-300">Total Pagado:</span>
          <span className="text-lg font-semibold text-blue-700 dark:text-blue-300">
            {formatCurrency(totalPagado, moneda)}
          </span>
        </div>
      </Card>

      {/* Estado de carga */}
      {cargando ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 dark:border-blue-400" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-md text-center">
          <div className="flex justify-center mb-2">
            <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button
            onClick={cargarPagos}
            variant="outline"
            size="sm"
            className="mt-2 dark:bg-gray-800 dark:border-gray-700"
          >
            Reintentar
          </Button>
        </div>
      ) : pagos.length === 0 ? (
        <div className="p-8 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-md text-center">
          <p className="text-gray-500 dark:text-gray-400">No hay pagos registrados para esta factura</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                <th className="p-2 border-b dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                <th className="p-2 border-b dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">Método</th>
                <th className="p-2 border-b dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">Referencia</th>
                <th className="p-2 border-b dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 text-right">Monto</th>
                <th className="p-2 border-b dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => (
                <tr key={pago.id} className="border-b dark:border-gray-700">
                  <td className="p-2 dark:text-gray-300">{formatDate(new Date(pago.created_at))}</td>
                  <td className="p-2 dark:text-gray-300">{getPaymentMethodName(pago.method)}</td>
                  <td className="p-2 dark:text-gray-300">{pago.reference || '-'}</td>
                  <td className="p-2 text-right dark:text-gray-300">{formatCurrency(pago.amount, pago.currency || moneda)}</td>
                  <td className="p-2 text-center">{getStatusBadge(pago.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Diálogo para registrar pago */}
      {facturaCompleta && (
        <RegistrarPagoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          factura={{
            ...facturaCompleta,
            number: facturaCompleta.number,
            total: facturaCompleta.total,
            balance: facturaCompleta.balance
          }}
          onSuccess={() => {
            setDialogOpen(false);
            cargarPagos(); // Recargar los pagos después de registrar uno nuevo
          }}
        />
      )}
    </div>
  );
}
