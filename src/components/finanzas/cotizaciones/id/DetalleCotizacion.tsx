'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { ArrowLeft, Printer, Mail, FileCheck2, Copy, Pencil, Send, Loader2, FileText, ExternalLink, FileDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toastSuccess, toastError, toastInfo } from '@/components/ui/use-toast';
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
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { CotizacionesService, type Quotation } from '@/lib/services/cotizacionesService';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';

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
  const [converting, setConverting] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(cotizacion.converted_invoice_number ?? null);
  const [duplicating, setDuplicating] = useState(false);
  const [sending, setSending] = useState(false);
  const [cotActual, setCotActual] = useState(cotizacion);
  // Montos en la moneda de la cotización o en la base de la organización.
  const monedaOrg = useMonedaOrganizacion();
  const monedaCotizacion = monedaOrg.paraDocumento(cotActual?.currency);
  const formatCurrency = crearFormateadorMoneda(monedaCotizacion);
  // Textos nuevos (conversión, correo, errores del servidor): namespace propio en los 4 idiomas.
  const tv = useTranslations('documentosVenta.cotizaciones');
  const ta = useTranslations('accionesDocumento');
  const mensajeError = (error: unknown) => (error instanceof Error && error.message ? error.message : tv('errores.error_desconocido'));

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'PPP', { locale: es });
    } catch {
      return 'Fecha inválida';
    }
  };

  // Imprimir y PDF: motor único de documentos (`GET /api/documentos/cotizacion/<id>`).
  // El servidor arma la cotización desde la base con la organización de la
  // sesión; la pestaña se abre dentro del clic para que no la bloqueen.
  const handleImprimir = () => imprimirDocumento('cotizacion', cotActual.id);
  const handleVerPdf = () => abrirDocumento('cotizacion', cotActual.id);

  // Envío real por correo con el PDF del motor de documentos. Antes solo cambiaba el estado.
  const handleEnviarEmail = async () => {
    if (!cotActual.customers?.email) {
      toastError('Error', 'El cliente no tiene email configurado');
      return;
    }
    try {
      setSending(true);
      toastInfo('Enviando...', `Enviando cotización ${cotActual.number} por email`);
      const r = await CotizacionesService.sendByEmail(cotActual.id);
      setCotActual({ ...cotActual, status: r.status as Quotation['status'] });
      toastSuccess('Cotización enviada', r.adjunto ? `Enviada a ${r.destino}` : tv('correo.sinAdjunto', { destino: r.destino }));
    } catch (error: unknown) {
      toastError('Error', mensajeError(error));
    } finally {
      setSending(false);
    }
  };

  // Transiciones validadas en el servidor (fn_cotizacion_cambiar_estado).
  const cambiarEstado = async (estado: 'sent' | 'accepted' | 'rejected') => {
    const r = await CotizacionesService.changeStatus(cotActual.id, estado);
    setCotActual({ ...cotActual, status: r.status as Quotation['status'], stored_status: r.status });
  };

  const handleMarcarEnviada = async () => {
    try {
      await cambiarEstado('sent');
      toastSuccess('Estado actualizado', 'Cotización marcada como enviada');
    } catch (error: unknown) {
      toastError('Error', mensajeError(error));
    }
  };

  const handleAceptar = async () => {
    try {
      await cambiarEstado('accepted');
      toastSuccess('Cotización aceptada', 'La cotización fue marcada como aceptada');
    } catch (error: unknown) {
      toastError('Error', mensajeError(error));
    }
  };

  const handleRechazar = async () => {
    try {
      await cambiarEstado('rejected');
      toastInfo('Cotización rechazada');
    } catch (error: unknown) {
      toastError('Error', mensajeError(error));
    }
  };

  // Conversión en el servidor: factura BORRADOR con venta ligada, impuestos y
  // comisión, en una transacción (fn_cotizacion_convertir). Se emite después.
  const handleConvertir = async () => {
    setShowConvertDialog(false);
    try {
      setConverting(true);
      const r = await CotizacionesService.convertToInvoice(cotActual.id);
      toastSuccess(tv('conversion.titulo'), tv(r.yaConvertida ? 'conversion.yaConvertida' : 'conversion.borrador', { numero: r.numero ?? '' }));
      if (r.faltantes.length > 0) toastInfo(tv('conversion.faltantes', { n: r.faltantes.length }));
      setCotActual({ ...cotActual, status: 'converted', stored_status: 'converted', converted_invoice_id: r.invoiceId });
      if (r.numero) setInvoiceNumber(r.numero);
    } catch (error: unknown) {
      toastError('Error', mensajeError(error));
    } finally {
      setConverting(false);
    }
  };

  const handleDuplicar = async () => {
    try {
      setDuplicating(true);
      const nueva = await CotizacionesService.duplicateQuotation(cotActual.id);
      toastSuccess('Cotización duplicada', `Nueva cotización ${nueva.number}`);
      router.push(`/app/finanzas/cotizaciones/${nueva.id}`);
    } catch (error: unknown) {
      toastError('Error', mensajeError(error));
    } finally {
      setDuplicating(false);
    }
  };

  // Editar mira el estado guardado (una vencida se edita para renovar su
  // vigencia); convertir y aceptar, el estado vivo (una vencida no se convierte).
  const canEdit = cotActual.stored_status === 'draft' || cotActual.stored_status === 'sent';
  const canConvert = cotActual.status === 'draft' || cotActual.status === 'sent' || cotActual.status === 'accepted';

  // Celular: una sola barra. «←» y el título van en el MobileHeader del shell.
  useCabeceraMovil({ modo: 'page', titulo: `Cotización ${cotActual.number}`, volverA: '/app/finanzas/cotizaciones' });

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          {/* En celular «←» ya está en el MobileHeader del shell: aquí sería la segunda flecha. */}
          <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={() => router.push('/app/finanzas/cotizaciones')}>
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
            <Printer className="h-4 w-4 mr-2" /> {ta('imprimir')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleVerPdf}>
            <FileDown className="h-4 w-4 mr-2" /> {ta('verPdf')}
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
                // eslint-disable-next-line @next/next/no-img-element -- imagen de una URL arbitraria (Storage o proveedor), sin dominio fijo para next/image
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
                <TableHead className="w-[80px] text-right">Impuesto</TableHead>
                <TableHead className="w-[120px] text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cotActual.quotation_items || []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-gray-900 dark:text-gray-100"><HtmlContentRenderer html={item.description} /></TableCell>
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
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(cotActual.subtotal + (cotActual.discount_total > 0 ? cotActual.discount_total : 0))}</span>
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
              <HtmlContentRenderer html={cotActual.terms_conditions} className="text-sm text-gray-900 dark:text-gray-100" />
            </Card>
          )}
          {cotActual.notes && (
            <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Notas Internas
              </h3>
              <HtmlContentRenderer html={cotActual.notes} className="text-sm text-gray-900 dark:text-gray-100" />
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
              {(cotActual.status === 'sent' || cotActual.status === 'draft' || cotActual.status === 'expired') && (
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
