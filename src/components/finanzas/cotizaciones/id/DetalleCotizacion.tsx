'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Printer, Mail, FileCheck2, Copy, Pencil, Send, Loader2, FileText, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast, toastSuccess, toastError, toastInfo } from '@/components/ui/use-toast';
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
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva, getOrganizationId } from '@/lib/hooks/useOrganization';
import { CotizacionesService, type Quotation } from '@/lib/services/cotizacionesService';
import { PDFService, type InvoiceDataForPDF } from '@/lib/services/pdfService';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    case 'sent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'accepted': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'expired': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'converted': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'draft': return 'Borrador';
    case 'sent': return 'Enviada';
    case 'accepted': return 'Aceptada';
    case 'rejected': return 'Rechazada';
    case 'expired': return 'Vencida';
    case 'converted': return 'Convertida';
    default: return status;
  }
};

interface DetalleCotizacionProps {
  cotizacion: Quotation;
}

export function DetalleCotizacion({ cotizacion }: DetalleCotizacionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [organizationData, setOrganizationData] = useState<any>(null);
  const [converting, setConverting] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [sending, setSending] = useState(false);
  const [cotActual, setCotActual] = useState(cotizacion);

  const organizationId = getOrganizationId();
  const org = obtenerOrganizacionActiva();

  useEffect(() => {
    const loadOrgData = async () => {
      if (!org?.id) return;
      try {
        const { data } = await supabase
          .from('organizations')
          .select('name, tax_id, nit, address, phone, email, logo_url, primary_color, secondary_color')
          .eq('id', org.id)
          .single();
        if (data) setOrganizationData(data);
      } catch (e) {
        console.error('Error loading org data:', e);
      }
    };
    loadOrgData();
  }, []);

  useEffect(() => {
    if (cotActual.status === 'converted' && cotActual.converted_invoice_id && !invoiceNumber) {
      supabase
        .from('invoice_sales')
        .select('number')
        .eq('id', cotActual.converted_invoice_id)
        .single()
        .then(({ data }) => {
          if (data?.number) setInvoiceNumber(data.number);
        });
    }
  }, [cotActual.status, cotActual.converted_invoice_id, invoiceNumber]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'PPP', { locale: es });
    } catch {
      return 'Fecha inválida';
    }
  };

  const buildPDFData = (): InvoiceDataForPDF => {
    return {
      id: cotActual.id,
      number: cotActual.number,
      issue_date: cotActual.issue_date,
      due_date: cotActual.valid_until || cotActual.issue_date,
      status: cotActual.status,
      currency: cotActual.currency || 'COP',
      subtotal: cotActual.subtotal || 0,
      tax_total: cotActual.tax_total || 0,
      total: cotActual.total || 0,
      balance: 0,
      notes: cotActual.terms_conditions || undefined,
      tax_included: cotActual.quotation_items?.[0]?.tax_included || false,
      discount_total: cotActual.discount_total > 0 ? cotActual.discount_total : undefined,
      organization: organizationData
        ? {
            name: organizationData.name || 'Mi Empresa',
            tax_id: organizationData.tax_id || organizationData.nit,
            address: organizationData.address,
            phone: organizationData.phone,
            email: organizationData.email,
            logo_url: organizationData.logo_url,
            primary_color: organizationData.primary_color,
            secondary_color: organizationData.secondary_color,
          }
        : undefined,
      customer: cotActual.customers
        ? {
            full_name: cotActual.customers.full_name,
            email: cotActual.customers.email,
            phone: cotActual.customers.phone,
            address: cotActual.customers.address,
            tax_id: cotActual.customers.identification_number,
          }
        : undefined,
      items: (cotActual.quotation_items || []).map((item) => ({
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        tax_included: item.tax_included,
        discount_amount: item.discount_amount || 0,
        total_line: item.total_line,
      })),
    };
  };

  const handleImprimir = async () => {
    try {
      const pdfData = buildPDFData();
      pdfData.status = 'quotation';
      await PDFService.printInvoiceHTML(pdfData);
      toastSuccess('PDF Generado', `Cotización ${cotActual.number} lista para imprimir.`);
    } catch (error: any) {
      toastError('Error', error.message);
    }
  };

  const handleEnviarEmail = async () => {
    if (!cotActual.customers?.email) {
      toastError('Error', 'El cliente no tiene email configurado');
      return;
    }
    try {
      setSending(true);
      toastInfo('Enviando...', `Enviando cotización ${cotActual.number} por email`);
      await CotizacionesService.changeStatus(cotActual.id, 'sent');
      setCotActual({ ...cotActual, status: 'sent' });
      toastSuccess('Cotización enviada', `Enviada a ${cotActual.customers.email}`);
    } catch (error: any) {
      toastError('Error', error.message);
    } finally {
      setSending(false);
    }
  };

  const handleMarcarEnviada = async () => {
    try {
      await CotizacionesService.changeStatus(cotActual.id, 'sent');
      setCotActual({ ...cotActual, status: 'sent' });
      toastSuccess('Estado actualizado', 'Cotización marcada como enviada');
    } catch (error: any) {
      toastError('Error', error.message);
    }
  };

  const handleAceptar = async () => {
    try {
      await CotizacionesService.changeStatus(cotActual.id, 'accepted');
      setCotActual({ ...cotActual, status: 'accepted' });
      toastSuccess('Cotización aceptada', 'La cotización fue marcada como aceptada');
    } catch (error: any) {
      toastError('Error', error.message);
    }
  };

  const handleRechazar = async () => {
    try {
      await CotizacionesService.changeStatus(cotActual.id, 'rejected');
      setCotActual({ ...cotActual, status: 'rejected' });
      toastInfo('Cotización rechazada');
    } catch (error: any) {
      toastError('Error', error.message);
    }
  };

  const handleConvertir = async () => {
    if (!organizationId) return;
    setShowConvertDialog(false);
    try {
      setConverting(true);
      const branchId = cotActual.branch_id || 0;
      if (!branchId) {
        const { data } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organizationId)
          .limit(1);
        if (!data || data.length === 0) {
          toastError('Error', 'No hay sucursal configurada');
          return;
        }
        const invoiceId = await CotizacionesService.convertToInvoice(cotActual.id, organizationId, data[0].id);
        toastSuccess('Factura creada', 'La cotización fue convertida a factura exitosamente');
        setCotActual({ ...cotActual, status: 'converted', converted_invoice_id: invoiceId });
        const { data: invData } = await supabase.from('invoice_sales').select('number').eq('id', invoiceId).single();
        if (invData?.number) setInvoiceNumber(invData.number);
        return;
      }
      const invoiceId = await CotizacionesService.convertToInvoice(cotActual.id, organizationId, branchId);
      toastSuccess('Factura creada', 'La cotización fue convertida a factura exitosamente');
      setCotActual({ ...cotActual, status: 'converted', converted_invoice_id: invoiceId });
      const { data: invData } = await supabase.from('invoice_sales').select('number').eq('id', invoiceId).single();
      if (invData?.number) setInvoiceNumber(invData.number);
    } catch (error: any) {
      toastError('Error', error.message);
    } finally {
      setConverting(false);
    }
  };

  const handleDuplicar = async () => {
    try {
      setDuplicating(true);
      const nueva = await CotizacionesService.duplicateQuotation(cotActual.id);
      toastSuccess('Cotización duplicada', `Nueva cotización ${nueva?.number}`);
      if (nueva) router.push(`/app/finanzas/cotizaciones/${nueva.id}`);
    } catch (error: any) {
      toastError('Error', error.message);
    } finally {
      setDuplicating(false);
    }
  };

  const canEdit = cotActual.status === 'draft' || cotActual.status === 'sent';
  const canConvert = cotActual.status !== 'converted' && cotActual.status !== 'rejected';

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/app/finanzas/cotizaciones')}>
            <ArrowLeft className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                Cotización {cotActual.number}
              </h1>
              <Badge className={`mt-1 ${getStatusColor(cotActual.status)}`}>
                {getStatusText(cotActual.status)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleImprimir}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button variant="outline" size="sm" onClick={handleEnviarEmail} disabled={sending || !cotActual.customers?.email}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Email
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/app/finanzas/cotizaciones/${cotActual.id}/editar`)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDuplicar} disabled={duplicating}>
            {duplicating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
            Duplicar
          </Button>
          {canConvert && (
            <Button size="sm" onClick={() => setShowConvertDialog(true)} disabled={converting} className="bg-green-600 hover:bg-green-700 text-white">
              {converting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck2 className="h-4 w-4 mr-2" />}
              Convertir a Factura
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Convertir a factura de venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción creará una factura de venta a partir de la cotización {cotActual.number}. La cotización quedará marcada como convertida y no podrá editarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConvertir}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Sí, convertir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Info general */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Cliente</h3>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {cotActual.customers?.avatar_url ? (
                <img
                  src={cotActual.customers.avatar_url}
                  alt={cotActual.customers?.full_name || 'Cliente'}
                  className="h-10 w-10 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center border-2 border-blue-200 dark:border-blue-800">
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {cotActual.customers?.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {cotActual.customers?.full_name || 'N/A'}
              </p>
              {cotActual.customers?.identification_number && <p className="text-sm text-gray-600 dark:text-gray-400">NIT/CC: {cotActual.customers.identification_number}</p>}
              {cotActual.customers?.phone && <p className="text-sm text-gray-600 dark:text-gray-400">Tel: {cotActual.customers.phone}</p>}
              {cotActual.customers?.email && <p className="text-sm text-gray-600 dark:text-gray-400">{cotActual.customers.email}</p>}
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Detalles</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Fecha de emisión:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(cotActual.issue_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Válida hasta:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(cotActual.valid_until)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Moneda:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{cotActual.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Plazo de pago:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{cotActual.payment_terms || 30} días</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Items */}
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mb-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Items</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800">
                <TableHead>Descripción</TableHead>
                <TableHead className="w-[80px] text-right">Cant.</TableHead>
                <TableHead className="w-[120px] text-right">Precio Unit.</TableHead>
                <TableHead className="w-[100px] text-right">Descuento</TableHead>
                <TableHead className="w-[80px] text-right">IVA</TableHead>
                <TableHead className="w-[120px] text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cotActual.quotation_items || []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-gray-900 dark:text-gray-100">{item.description}</TableCell>
                  <TableCell className="text-right">{item.qty}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right">
                    {item.discount_amount && item.discount_amount > 0
                      ? formatCurrency(item.discount_amount)
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.tax_rate ? `${item.tax_rate}%${item.tax_included ? ' (incl.)' : ''}` : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(item.total_line)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totales */}
        <div className="flex justify-end mt-4">
          <div className="w-full sm:w-72 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(cotActual.subtotal)}</span>
            </div>
            {cotActual.discount_total > 0 && (
              <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                <span>Descuentos:</span>
                <span>- {formatCurrency(cotActual.discount_total)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Impuestos:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(cotActual.tax_total)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 border-gray-200 dark:border-gray-700">
              <span className="text-gray-900 dark:text-gray-100">Total:</span>
              <span className="text-blue-600 dark:text-blue-400">{formatCurrency(cotActual.total)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Términos y notas */}
      {(cotActual.terms_conditions || cotActual.notes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {cotActual.terms_conditions && (
            <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Términos y Condiciones
              </h3>
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                {cotActual.terms_conditions}
              </p>
            </Card>
          )}
          {cotActual.notes && (
            <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Notas Internas
              </h3>
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                {cotActual.notes}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Acciones de estado / Factura relacionada */}
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        {cotActual.status === 'converted' && cotActual.converted_invoice_id ? (
          <>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">
              Factura de Venta Relacionada
            </h3>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {invoiceNumber || 'Factura de venta'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Creada a partir de esta cotización
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/app/finanzas/facturas-venta/${cotActual.converted_invoice_id}`)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Ver factura
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">
              Cambiar Estado
            </h3>
            <div className="flex flex-wrap gap-2">
              {cotActual.status === 'draft' && (
                <Button variant="outline" size="sm" onClick={handleMarcarEnviada}>
                  <Send className="h-4 w-4 mr-2" /> Marcar como Enviada
                </Button>
              )}
              {(cotActual.status === 'sent' || cotActual.status === 'draft') && (
                <Button variant="outline" size="sm" onClick={handleAceptar} className="text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700">
                  <FileCheck2 className="h-4 w-4 mr-2" /> Marcar Aceptada
                </Button>
              )}
              {(cotActual.status === 'sent' || cotActual.status === 'draft') && (
                <Button variant="outline" size="sm" onClick={handleRechazar} className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700">
                  Rechazar
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
