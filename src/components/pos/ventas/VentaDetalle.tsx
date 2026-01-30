'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Printer,
  Copy,
  XCircle,
  RotateCcw,
  FileText,
  User,
  Calendar,
  CreditCard,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  Receipt,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { VentasService } from './VentasService';
import { SaleWithDetails } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { cn } from '@/utils/Utils';
import { PrintService } from '@/lib/services/printService';
import { SendToFactusButton, FactusStatusBadge } from '@/components/finanzas/facturacion-electronica';
import { electronicInvoicingService, type EInvoiceStatus } from '@/lib/services/electronicInvoicingService';

interface VentaDetalleProps {
  saleId: string;
}

export function VentaDetalle({ saleId }: VentaDetalleProps) {
  const router = useRouter();
  const { organization } = useOrganization();
  const [sale, setSale] = useState<SaleWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [eInvoiceStatus, setEInvoiceStatus] = useState<EInvoiceStatus | null>(null);
  const [eInvoiceCufe, setEInvoiceCufe] = useState<string | null>(null);

  useEffect(() => {
    loadSale();
    loadEInvoiceStatus();
  }, [saleId]);

  const loadEInvoiceStatus = async () => {
    try {
      // Buscar si hay una factura asociada a esta venta
      const { data: invoice } = await supabase
        .from('invoice_sales')
        .select('id')
        .eq('sale_id', saleId)
        .single();
      
      if (invoice) {
        const job = await electronicInvoicingService.getInvoiceEInvoiceStatus(invoice.id);
        if (job) {
          setEInvoiceStatus(job.status);
          setEInvoiceCufe(job.cufe);
        }
      }
    } catch (error) {
      // No hay factura asociada, ignorar
    }
  };

  const loadSale = async () => {
    setIsLoading(true);
    try {
      const data = await VentasService.getSaleById(saleId);
      setSale(data);
    } catch (error) {
      console.error('Error loading sale:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    if (!sale) return;
    PrintService.smartPrint(
      sale,
      sale.items || [],
      sale.customer,
      sale.payments || [],
      { name: organization?.name || 'Mi Empresa' }
    );
  };

  const handleDuplicate = async () => {
    if (!sale) return;
    const result = await VentasService.duplicateSale(sale.id);
    if (result) {
      sessionStorage.setItem('duplicateSaleItems', JSON.stringify(result.items));
      router.push('/app/pos/ventas/nuevo?duplicate=true');
    }
  };

  const handleCancel = async () => {
    if (!sale) return;
    if (!confirm('¿Está seguro de anular esta venta?')) return;

    const reason = prompt('Motivo de la anulación:');
    const success = await VentasService.cancelSale(sale.id, reason || undefined);
    if (success) {
      loadSale();
      alert('Venta anulada correctamente');
    }
  };

  const handleCreateReturn = () => {
    if (!sale) return;
    router.push(`/app/pos/devoluciones/nuevo?sale_id=${sale.id}`);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      completed: { 
        bg: 'bg-green-100 dark:bg-green-900/30', 
        text: 'text-green-700 dark:text-green-400',
        icon: <CheckCircle className="h-4 w-4" />
      },
      pending: { 
        bg: 'bg-yellow-100 dark:bg-yellow-900/30', 
        text: 'text-yellow-700 dark:text-yellow-400',
        icon: <Clock className="h-4 w-4" />
      },
      cancelled: { 
        bg: 'bg-red-100 dark:bg-red-900/30', 
        text: 'text-red-700 dark:text-red-400',
        icon: <XCircle className="h-4 w-4" />
      }
    };

    const style = styles[status] || styles.pending;

    return (
      <Badge className={cn(style.bg, style.text, 'border-0 flex items-center gap-1')}>
        {style.icon}
        {status === 'completed' ? 'Completada' : status === 'pending' ? 'Pendiente' : 'Anulada'}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Venta no encontrada
        </h2>
        <Link href="/app/pos/ventas">
          <Button className="mt-4">Volver al listado</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/app/pos/ventas">
            <Button variant="ghost" size="icon" className="dark:text-gray-400">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Venta #{sale.id.slice(0, 8)}
              </h1>
              {getStatusBadge(sale.status)}
              {eInvoiceStatus && (
                <FactusStatusBadge
                  status={eInvoiceStatus}
                  cufe={eInvoiceCufe}
                  size="md"
                  showTooltip={true}
                />
              )}
            </div>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {formatDate(sale.sale_date || sale.created_at)} a las{' '}
              {new Date(sale.sale_date || sale.created_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handlePrint} className="dark:border-gray-700">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={handleDuplicate} className="dark:border-gray-700">
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </Button>
          {sale.status === 'completed' && (
            <Button variant="outline" onClick={handleCreateReturn} className="dark:border-gray-700">
              <RotateCcw className="h-4 w-4 mr-2" />
              Devolución
            </Button>
          )}
          {sale.status !== 'cancelled' && (
            <Button variant="destructive" onClick={handleCancel}>
              <XCircle className="h-4 w-4 mr-2" />
              Anular
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Info principal */}
        <div className="md:col-span-2 space-y-6">
          {/* Items */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Package className="h-5 w-5" />
                Productos ({sale.items?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-400">Producto</TableHead>
                    <TableHead className="dark:text-gray-400 text-right">Cant.</TableHead>
                    <TableHead className="dark:text-gray-400 text-right">Precio</TableHead>
                    <TableHead className="dark:text-gray-400 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sale.items || []).map((item: any) => (
                    <TableRow key={item.id} className="dark:border-gray-700">
                      <TableCell className="dark:text-gray-300">
                        <div>
                          <p className="font-medium">
                            {item.products?.name || item.notes?.product_name || 'Producto'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            SKU: {item.products?.sku || 'N/A'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right dark:text-gray-300">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right dark:text-gray-300">
                        {formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right font-medium dark:text-gray-300">
                        {formatCurrency(item.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagos */}
          {sale.payments && sale.payments.length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <CreditCard className="h-5 w-5" />
                  Pagos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sale.payments.map((payment: any) => (
                    <div 
                      key={payment.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                          <CreditCard className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white capitalize">
                            {payment.method}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(payment.created_at)}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(payment.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Panel lateral */}
        <div className="space-y-6">
          {/* Cliente */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <User className="h-5 w-5" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sale.customer ? (
                <div className="space-y-2">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {sale.customer.full_name}
                  </p>
                  {sale.customer.doc_number && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Doc: {sale.customer.doc_number}
                    </p>
                  )}
                  {sale.customer.email && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {sale.customer.email}
                    </p>
                  )}
                  {sale.customer.phone && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {sale.customer.phone}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">Cliente genérico</p>
              )}
            </CardContent>
          </Card>

          {/* Totales */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Receipt className="h-5 w-5" />
                Resumen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>{formatCurrency(sale.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Impuestos</span>
                <span>{formatCurrency(sale.tax_total || 0)}</span>
              </div>
              {Number(sale.discount_total) > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Descuentos</span>
                  <span>-{formatCurrency(sale.discount_total || 0)}</span>
                </div>
              )}
              <Separator className="dark:bg-gray-700" />
              <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white">
                <span>Total</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
              {Number(sale.balance) > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400 font-medium">
                  <span>Saldo Pendiente</span>
                  <span>{formatCurrency(sale.balance)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notas */}
          {sale.notes && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <FileText className="h-5 w-5" />
                  Notas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400 text-sm whitespace-pre-wrap">
                  {sale.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
