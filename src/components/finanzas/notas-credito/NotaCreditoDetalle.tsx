'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  FileText,
  User,
  Download,
  Loader2,
  XCircle,
  RefreshCw,
  Clock,
  Hash,
  Mail,
  FileCheck,
  ExternalLink,
  Printer,
} from 'lucide-react';
import { DetailSkeleton } from '@/components/common/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ItemsDetalle } from '@/components/finanzas/facturas-venta/id/ItemsDetalle';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import {
  notasCreditoService,
  NotaCredito,
  EInvoiceJob,
  EInvoiceEvent
} from '@/lib/services/notasCreditoService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';

/** La nota es una fila de `invoice_sales` (select *): trae su propia `currency`. */
type NotaConMoneda = NotaCredito & { currency?: string | null };

interface NotaCreditoDetalleProps {
  id: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  void: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

/** Estados con etiqueta en `notasCredito.estados`. */
const ESTADOS_CONOCIDOS = new Set(['draft', 'pending', 'sent', 'accepted', 'rejected', 'void', 'paid']);

const eInvoiceStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

/** Estados del envío electrónico con etiqueta en `notasCredito.estadosFe`. */
const ESTADOS_FE_CONOCIDOS = new Set(['pending', 'processing', 'sent', 'accepted', 'rejected', 'failed']);

export function NotaCreditoDetalle({ id }: NotaCreditoDetalleProps) {
  const router = useRouter();
  const [nota, setNota] = useState<NotaCredito | null>(null);
  const [eInvoiceJob, setEInvoiceJob] = useState<EInvoiceJob | null>(null);
  const [eInvoiceEvents, setEInvoiceEvents] = useState<EInvoiceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSendingDian, setIsSendingDian] = useState(false);
  const [isDescargando, setIsDescargando] = useState(false);
  const [organizationTaxes, setOrganizationTaxes] = useState<{ id: string; name: string; rate: number; is_default?: boolean }[]>([]);
  // Importes en la moneda de la nota (la de su factura); sin ella, la base de la organización.
  const { paraDocumento } = useMonedaOrganizacion();
  const monedaNota = (nota as NotaConMoneda | null)?.currency ?? null;
  const formatCurrency = crearFormateadorMoneda(paraDocumento(monedaNota));
  const t = useTranslations('notasCredito');
  const ta = useTranslations('accionesDocumento');
  // issue_date y created_at son timestamptz: el día sale en la zona de la organización.
  const { formatDate } = useFormatDate();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const notaData = await notasCreditoService.getNotaCreditoById(id);
      setNota(notaData);

      if (notaData) {
        const job = await notasCreditoService.getEInvoiceStatus(id);
        setEInvoiceJob(job);

        if (job) {
          const events = await notasCreditoService.getEInvoiceEvents(job.id);
          setEInvoiceEvents(events);
        }

        // Cargar impuestos de la organización para resolver nombres
        const orgId = getOrganizationId();
        if (orgId) {
          const { data: taxes } = await supabase
            .from('organization_taxes')
            .select('id, name, rate, is_default')
            .eq('organization_id', orgId)
            .eq('is_active', true);
          if (taxes) setOrganizationTaxes(taxes);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: t('comun.error'),
        description: t('detalle.errorCarga'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnular = async () => {
    if (!nota) return;
    if (!confirm(t('anular.confirmar'))) return;

    const reason = prompt(t('anular.motivo'));
    try {
      const result = await notasCreditoService.anularNotaCredito(nota.id, reason || undefined);
      if (result.success) {
        toast({ title: t('comun.exito'), description: t('anular.hecho') });
        router.push('/app/finanzas/notas-credito');
      } else {
        toast({ title: t('comun.error'), description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('comun.error'), description: t('anular.error'), variant: 'destructive' });
    }
  };

  const handleRetryDian = async () => {
    if (!nota) return;
    setIsRetrying(true);
    try {
      const result = await notasCreditoService.retryDianSubmission(nota.id);
      if (result.success) {
        toast({ title: t('comun.exito'), description: t('detalle.reintentoProgramado') });
        loadData();
      } else {
        toast({ title: t('comun.error'), description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('comun.error'), description: t('detalle.errorReintentar'), variant: 'destructive' });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSendToDian = async () => {
    if (!nota) return;
    const orgId = getOrganizationId();
    if (!orgId) {
      toast({ title: t('comun.error'), description: t('detalle.sinOrganizacion'), variant: 'destructive' });
      return;
    }
    setIsSendingDian(true);
    try {
      const reason = nota.description || nota.notes || 'Nota de crédito';
      const result = await notasCreditoService.sendToFactus(nota.id, Number(orgId), reason);
      if (result.success) {
        toast({
          title: t('detalle.enviadaDian'),
          description: t('detalle.cufeCorto', { cufe: result.data?.cufe?.substring(0, 16) || '' }),
        });
        loadData();
      } else {
        toast({ title: t('comun.error'), description: result.error, variant: 'destructive' });
      }
    } catch (error: unknown) {
      toast({ title: t('comun.error'), description: (error as { message?: string }).message || t('detalle.errorEnviarDian'), variant: 'destructive' });
    } finally {
      setIsSendingDian(false);
    }
  };

  // PDF de marca del motor único (`GET /api/documentos/nota-credito/<id>`): el
  // servidor lee la nota con la organización de la sesión, con su CUDE y el QR
  // de la DIAN cuando la nota ya es electrónica. Antes este botón no descargaba nada.
  const handleDownloadPDF = async () => {
    if (!nota) return;
    setIsDescargando(true);
    try {
      await descargarDocumento('nota-credito', nota.id);
    } catch (error: unknown) {
      toast({ title: ta('errorTitulo'), description: error instanceof Error && error.message ? error.message : ta('error'), variant: 'destructive' });
    } finally {
      setIsDescargando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <DetailSkeleton />
      </div>
    );
  }

  if (!nota) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t('detalle.noEncontrada')}
        </h2>
        <Link href="/app/finanzas/notas-credito">
          <Button className="mt-4">{t('detalle.volverListado')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/notas-credito">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={t('detalle.volverListado')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('detalle.titulo', { numero: nota.number })}
              </h1>
              <Badge className={statusColors[nota.status]}>
                {ESTADOS_CONOCIDOS.has(nota.status) ? t(`estados.${nota.status}`) : nota.status}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('detalle.emitidaEl', { fecha: formatDate(nota.issue_date) })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => imprimirDocumento('nota-credito', nota.id)} className="dark:border-gray-700">
            <Printer className="h-4 w-4 mr-2" />
            {ta('imprimir')}
          </Button>
          <Button variant="outline" onClick={handleDownloadPDF} disabled={isDescargando} className="dark:border-gray-700">
            {isDescargando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {t('detalle.descargarPdf')}
          </Button>
          {/* Botón Enviar a DIAN: visible cuando no hay job o el job falló */}
          {nota.status !== 'void' && nota.status !== 'accepted' && (!eInvoiceJob || eInvoiceJob.status === 'failed' || eInvoiceJob.status === 'rejected') && (
            <Button
              variant="default"
              onClick={handleSendToDian}
              disabled={isSendingDian}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSendingDian ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileCheck className="h-4 w-4 mr-2" />
              )}
              {t('detalle.enviarDian')}
            </Button>
          )}
          {/* Botón Reintentar: visible cuando hay job que falló */}
          {eInvoiceJob && (eInvoiceJob.status === 'rejected' || eInvoiceJob.status === 'failed') && (
            <Button
              variant="outline"
              onClick={handleRetryDian}
              disabled={isRetrying}
              className="dark:border-gray-700"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t('detalle.reintentarDian')}
            </Button>
          )}
          {nota.status !== 'void' && nota.status !== 'accepted' && (
            <Button variant="destructive" onClick={handleAnular}>
              <XCircle className="h-4 w-4 mr-2" />
              {t('detalle.anular')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Factura Relacionada */}
          {nota.related_invoice && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <FileCheck className="h-5 w-5" />
                  {t('detalle.facturaOrigen')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.numeroFactura')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {nota.related_invoice.number}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.totalFactura')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(Number(nota.related_invoice.total))}
                    </p>
                  </div>
                  <Link href={`/app/finanzas/facturas-venta/${nota.related_invoice_id}`}>
                    <Button variant="outline" size="sm" className="dark:border-gray-600">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t('detalle.verFactura')}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Items */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FileText className="h-5 w-5" />
                {t('detalle.items')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ItemsDetalle items={nota.items || []} taxIncluded={nota.tax_included || false} organizationTaxes={organizationTaxes} currency={monedaNota} />

              {/* Totals */}
              <div className="border-t dark:border-gray-700 p-4 space-y-2 mt-4">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>{t('detalle.subtotal')}</span>
                  <span>{formatCurrency(Number(nota.subtotal))}</span>
                </div>
                {(() => {
                  const taxTotal = Number(nota.tax_total) || 0;
                  if (taxTotal === 0) return null;

                  // Agrupar impuestos por tasa desde los items
                  const taxGroups: Record<string, { rate: number; amount: number; name: string }> = {};
                  (nota.items || []).forEach(item => {
                    const rate = Number(item.tax_rate) || 0;
                    if (rate <= 0) return;
                    const key = rate.toString();
                    if (!taxGroups[key]) {
                      const orgTax = organizationTaxes.find(t => Number(t.rate) === rate);
                      taxGroups[key] = { rate, amount: 0, name: orgTax?.name || t('detalle.impuestoTasa', { tasa: rate }) };
                    }
                    // Calcular monto del impuesto de este item
                    const lineTotal = Math.abs(Number(item.total_line) || 0);
                    const isIncluded = item.tax_included ?? nota.tax_included;
                    if (isIncluded) {
                      taxGroups[key].amount += lineTotal - (lineTotal / (1 + rate / 100));
                    } else {
                      taxGroups[key].amount += (lineTotal * rate) / 100;
                    }
                  });

                  const groups = Object.values(taxGroups);
                  if (groups.length === 0) {
                    return (
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span>{nota.tax_included ? t('detalle.impuestosIncluidos') : t('detalle.impuestosAdicionales')}</span>
                        <span>{formatCurrency(taxTotal)}</span>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1">
                      {groups.map(g => (
                        <div key={g.rate} className="flex justify-between text-gray-600 dark:text-gray-300">
                          <span>{g.name} {nota.tax_included ? t('detalle.incluido') : t('detalle.adicional')}</span>
                          <span>-{formatCurrency(g.amount)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <Separator className="dark:bg-gray-700" />
                <div className="flex justify-between text-lg font-bold text-red-600 dark:text-red-400">
                  <span>{t('detalle.totalNota')}</span>
                  <span>{formatCurrency(Number(nota.total))}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estado DIAN */}
          {eInvoiceJob && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <FileCheck className="h-5 w-5" />
                  {t('detalle.estadoFe')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.estadoDian')}</p>
                    <Badge className={eInvoiceStatusColors[eInvoiceJob.status]}>
                      {ESTADOS_FE_CONOCIDOS.has(eInvoiceJob.status) ? t(`estadosFe.${eInvoiceJob.status}`) : eInvoiceJob.status}
                    </Badge>
                  </div>
                  {eInvoiceJob.cufe && (
                    <div className="text-right">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.cufe')}</p>
                      <p className="font-mono text-xs text-gray-900 dark:text-white break-words whitespace-normal min-w-0">
                        {eInvoiceJob.cufe}
                      </p>
                    </div>
                  )}
                </div>

                {eInvoiceEvents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('detalle.historial')}
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {eInvoiceEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-700/30 rounded text-sm"
                        >
                          <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-gray-900 dark:text-white">{event.event_type}</p>
                            {event.message && (
                              <p className="text-gray-500 dark:text-gray-400 text-xs">
                                {event.message}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {formatDate(event.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Cliente */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <User className="h-5 w-5" />
                {t('detalle.cliente')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {nota.customer ? (
                <>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {`${nota.customer.first_name || ''} ${nota.customer.last_name || ''}`.trim() || t('detalle.sinNombre')}
                    </p>
                  </div>
                  {nota.customer.identification_number && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Hash className="h-4 w-4 text-gray-400" />
                      {nota.customer.identification_number}
                    </div>
                  )}
                  {nota.customer.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Mail className="h-4 w-4 text-gray-400" />
                      {nota.customer.email}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">{t('detalle.sinCliente')}</p>
              )}
            </CardContent>
          </Card>

          {/* Info */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FileText className="h-5 w-5" />
                {t('detalle.informacion')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.numero')}</p>
                <p className="font-medium text-gray-900 dark:text-white">{nota.number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.fechaEmision')}</p>
                <p className="text-gray-900 dark:text-white">{formatDate(nota.issue_date)}</p>
              </div>
              {nota.reference_code && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.codigoReferencia')}</p>
                  <p className="text-gray-900 dark:text-white">{nota.reference_code}</p>
                </div>
              )}
              {(nota.description || nota.notes) && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('detalle.notas')}</p>
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                    {nota.description || nota.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Card */}
          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
            <CardContent className="pt-6">
              <p className="text-red-100 text-sm">{t('detalle.totalNota')}</p>
              <p className="text-3xl font-bold mt-1">
                {formatCurrency(Number(nota.total))}
              </p>
              <p className="text-red-100 text-sm mt-2">
                {formatDate(nota.issue_date)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
