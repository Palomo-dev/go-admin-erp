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
  RefreshCw,
  Globe,
  ShoppingCart,
  Truck,
  MapPin,
  Tag,
  Wallet,
  Utensils,
  Users,
  Timer,
  BookOpen,
  ExternalLink,
  DollarSign
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

  const handlePrint = async () => {
    if (!sale) return;
    const { business, branch } = await PrintService.getBusinessAndBranch(sale.organization_id);
    PrintService.smartPrint(
      sale,
      sale.items || [],
      sale.customer,
      sale.payments || [],
      business || { name: organization?.name || 'Mi Empresa', logoUrl: organization?.logo_url },
      sale.seller_name ? { name: sale.seller_name } : undefined,
      branch,
      Array.isArray((sale as any).tax_breakdown) && (sale as any).tax_breakdown.length > 0
        ? (sale as any).tax_breakdown
        : undefined
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
      paid: { 
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

    const label =
      status === 'completed' || status === 'paid' ? 'Completada'
      : status === 'pending' ? 'Pendiente'
      : status === 'cancelled' ? 'Anulada'
      : status;

    return (
      <Badge className={cn(style.bg, style.text, 'border-0 flex items-center gap-1')}>
        {style.icon}
        {label}
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
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-words">
                {sale._source === 'web' ? `Pedido ${sale.invoice_number || '#' + sale.id.slice(0, 8)}` : `Venta #${sale.id.slice(0, 8)}`}
              </h1>
              {sale._source === 'web' ? (
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 flex items-center gap-1 shrink-0">
                  <Globe className="h-3.5 w-3.5" />
                  Web
                </Badge>
              ) : sale._source === 'mesa' || sale.mesa_info ? (
                <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0 flex items-center gap-1 shrink-0">
                  <Utensils className="h-3.5 w-3.5" />
                  Mesa
                </Badge>
              ) : (
                <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-0 flex items-center gap-1 shrink-0">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  POS
                </Badge>
              )}
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {formatDate(sale.sale_date || sale.created_at)} a las{' '}
              {new Date(sale.sale_date || sale.created_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="dark:border-gray-700">
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir
          </Button>
          <Button variant="outline" size="sm" onClick={handleDuplicate} className="dark:border-gray-700">
            <Copy className="h-4 w-4 mr-1.5" />
            Duplicar
          </Button>
          {sale.status === 'completed' && (
            <Button variant="outline" size="sm" onClick={handleCreateReturn} className="dark:border-gray-700">
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Devolución
            </Button>
          )}
          {sale.status !== 'cancelled' && (
            <Button variant="destructive" size="sm" onClick={handleCancel}>
              <XCircle className="h-4 w-4 mr-1.5" />
              Anular
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Info principal */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          {/* Items */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Package className="h-5 w-5" />
                Productos ({sale.items?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                      <TableCell className="dark:text-gray-300 min-w-[180px]">
                        <div className="space-y-0.5">
                          <p className="font-medium text-sm leading-snug break-words">
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
              </div>
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
        <div className="space-y-4 lg:space-y-6">
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
              {Array.isArray((sale as any).tax_breakdown) && (sale as any).tax_breakdown.length > 0 ? (
                (sale as any).tax_breakdown.map((tax: { name: string; amount: number }, idx: number) => (
                  <div key={idx} className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{tax.name}{(sale as any).tax_included ? ' (incluido)' : ''}</span>
                    <span>{formatCurrency(tax.amount || 0)}</span>
                  </div>
                ))
              ) : (
                (sale.tax_total || 0) > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{(sale as any).tax_included ? 'Impuestos (incluidos)' : 'Impuestos'}</span>
                    <span>{formatCurrency(sale.tax_total || 0)}</span>
                  </div>
                )
              )}
              {Number(sale.discount_total) > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Descuentos</span>
                  <span>-{formatCurrency(sale.discount_total || 0)}</span>
                </div>
              )}
              {Number(sale.delivery_fee) > 0 && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Envío</span>
                  <span>{formatCurrency(sale.delivery_fee || 0)}</span>
                </div>
              )}
              {Number(sale.tip_amount) > 0 && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Propina</span>
                  <span>{formatCurrency(sale.tip_amount || 0)}</span>
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

          {/* Info Mesa */}
          {sale.mesa_info && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <Utensils className="h-5 w-5" />
                  Información de Mesa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <Utensils className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Mesa</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {sale.mesa_info.table_name || `Mesa #${sale.mesa_info.table_number || 'N/A'}`}
                    </p>
                  </div>
                </div>
                {sale.mesa_info.server_name && (
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Mesero</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {sale.mesa_info.server_name}
                      </p>
                    </div>
                  </div>
                )}
                {sale.mesa_info.customers != null && sale.mesa_info.customers > 0 && (
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Comensales</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {sale.mesa_info.customers}
                      </p>
                    </div>
                  </div>
                )}
                {sale.mesa_info.opened_at && (
                  <div className="flex items-start gap-2">
                    <Timer className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Tiempo en mesa</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {sale.mesa_info.closed_at
                          ? `${Math.round((new Date(sale.mesa_info.closed_at).getTime() - new Date(sale.mesa_info.opened_at).getTime()) / 60000)} min`
                          : 'En curso'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(sale.mesa_info.opened_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {sale.mesa_info.closed_at && ` - ${new Date(sale.mesa_info.closed_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Factura asociada */}
          {sale.invoice && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <FileText className="h-5 w-5" />
                  Factura
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {sale.invoice.number}
                    </p>
                  </div>
                  <Badge className={cn(
                    sale.invoice.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : sale.invoice.status === 'partial' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
                    'border-0'
                  )}>
                    {sale.invoice.status === 'paid' ? 'Pagada' : sale.invoice.status === 'partial' ? 'Parcial' : sale.invoice.status}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Total factura</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(sale.invoice.total)}</span>
                </div>
                {Number(sale.invoice.balance) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Saldo</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(sale.invoice.balance)}</span>
                  </div>
                )}
                <Link href={`/app/finanzas/facturas-venta/${sale.invoice.id}`}>
                  <Button variant="outline" size="sm" className="w-full dark:border-gray-700">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Ver factura
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Cuenta por cobrar */}
          {sale.accounts_receivable && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <DollarSign className="h-5 w-5" />
                  Cuenta por Cobrar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Estado</p>
                    <Badge className={cn(
                      sale.accounts_receivable.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : sale.accounts_receivable.status === 'partial' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                      'border-0'
                    )}>
                      {sale.accounts_receivable.status === 'paid' ? 'Pagada'
                        : sale.accounts_receivable.status === 'partial' ? 'Parcial'
                        : sale.accounts_receivable.status === 'overdue' ? 'Vencida'
                        : sale.accounts_receivable.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Monto total</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(sale.accounts_receivable.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Balance</span>
                  <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(sale.accounts_receivable.balance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Vencimiento</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatDate(sale.accounts_receivable.due_date)}</span>
                </div>
                <Link href="/app/finanzas/cuentas-por-cobrar">
                  <Button variant="outline" size="sm" className="w-full dark:border-gray-700">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Ver en cuentas por cobrar
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Asiento contable */}
          {sale.journal_entry && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <BookOpen className="h-5 w-5" />
                  Asiento Contable
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Memo</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {sale.journal_entry.memo}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn(
                    sale.journal_entry.posted
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                    'border-0'
                  )}>
                    {sale.journal_entry.posted ? 'Publicado' : 'Borrador'}
                  </Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(sale.journal_entry.entry_date)}
                  </span>
                </div>
                {sale.journal_entry.lines && sale.journal_entry.lines.length > 0 && (
                  <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="dark:border-gray-700">
                          <TableHead className="dark:text-gray-400 text-xs h-8">Cuenta</TableHead>
                          <TableHead className="dark:text-gray-400 text-xs h-8 text-right">Débito</TableHead>
                          <TableHead className="dark:text-gray-400 text-xs h-8 text-right">Crédito</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sale.journal_entry.lines.map((line) => (
                          <TableRow key={line.id} className="dark:border-gray-700">
                            <TableCell className="text-xs dark:text-gray-300 py-1.5">
                              <span className="font-mono">{line.account_code}</span>
                              {line.description && (
                                <p className="text-gray-400 dark:text-gray-500 text-[10px]">{line.description}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-right py-1.5 dark:text-gray-300">
                              {Number(line.debit) > 0 ? formatCurrency(line.debit) : '-'}
                            </TableCell>
                            <TableCell className="text-xs text-right py-1.5 dark:text-gray-300">
                              {Number(line.credit) > 0 ? formatCurrency(line.credit) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <Link href="/app/finanzas/contabilidad/asientos">
                  <Button variant="outline" size="sm" className="w-full dark:border-gray-700">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Ver en contabilidad
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Info Web */}
          {sale._source === 'web' && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <Globe className="h-5 w-5" />
                  Detalles del Pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sale.delivery_type && (
                  <div className="flex items-start gap-2">
                    <Truck className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Tipo de entrega</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                        {sale.delivery_type === 'delivery' ? 'Domicilio' : sale.delivery_type === 'pickup' ? 'Recoger en tienda' : sale.delivery_type}
                      </p>
                    </div>
                  </div>
                )}
                {sale.delivery_address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Dirección de entrega</p>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {typeof sale.delivery_address === 'string' ? sale.delivery_address : sale.delivery_address?.address || sale.delivery_address?.formatted || JSON.stringify(sale.delivery_address)}
                      </p>
                    </div>
                  </div>
                )}
                {sale.payment_method && (
                  <div className="flex items-start gap-2">
                    <Wallet className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Método de pago</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                        {sale.payment_method}
                      </p>
                    </div>
                  </div>
                )}
                {sale.coupon_code && (
                  <div className="flex items-start gap-2">
                    <Tag className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Cupón aplicado</p>
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {sale.coupon_code}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
