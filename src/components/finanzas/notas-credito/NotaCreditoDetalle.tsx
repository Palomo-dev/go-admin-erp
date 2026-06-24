'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Download,
  Loader2,
  XCircle,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  Hash,
  Building2,
  Mail,
  Phone,
  FileCheck,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ItemsDetalle } from '@/components/finanzas/facturas-venta/id/ItemsDetalle';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/Utils';
import {
  notasCreditoService,
  NotaCredito,
  EInvoiceJob,
  EInvoiceEvent
} from '@/lib/services/notasCreditoService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

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

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  sent: 'Enviada',
  accepted: 'Aceptada DIAN',
  rejected: 'Rechazada',
  void: 'Anulada',
  paid: 'Pagada',
};

const eInvoiceStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const eInvoiceStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  failed: 'Fallida',
};

export function NotaCreditoDetalle({ id }: NotaCreditoDetalleProps) {
  const router = useRouter();
  const [nota, setNota] = useState<NotaCredito | null>(null);
  const [eInvoiceJob, setEInvoiceJob] = useState<EInvoiceJob | null>(null);
  const [eInvoiceEvents, setEInvoiceEvents] = useState<EInvoiceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [organizationTaxes, setOrganizationTaxes] = useState<{ id: string; name: string; rate: number; is_default?: boolean }[]>([]);

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
        title: 'Error',
        description: 'No se pudo cargar el detalle',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnular = async () => {
    if (!nota) return;
    if (!confirm('¿Está seguro de anular esta nota de crédito?')) return;

    const reason = prompt('Motivo de la anulación:');
    try {
      const result = await notasCreditoService.anularNotaCredito(nota.id, reason || undefined);
      if (result.success) {
        toast({ title: 'Éxito', description: 'Nota de crédito anulada correctamente' });
        router.push('/app/finanzas/notas-credito');
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al anular', variant: 'destructive' });
    }
  };

  const handleRetryDian = async () => {
    if (!nota) return;
    setIsRetrying(true);
    try {
      const result = await notasCreditoService.retryDianSubmission(nota.id);
      if (result.success) {
        toast({ title: 'Éxito', description: 'Reintento de envío programado' });
        loadData();
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al reintentar', variant: 'destructive' });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDownloadPDF = () => {
    toast({ title: 'Descarga', description: 'Generando PDF...' });
    // Aquí iría la lógica de descarga de PDF
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!nota) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Nota de crédito no encontrada
        </h2>
        <Link href="/app/finanzas/notas-credito">
          <Button className="mt-4">Volver al listado</Button>
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
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                NC {nota.number}
              </h1>
              <Badge className={statusColors[nota.status]}>
                {statusLabels[nota.status] || nota.status}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Emitida el {formatDate(nota.issue_date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} className="dark:border-gray-700">
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
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
              Reintentar DIAN
            </Button>
          )}
          {nota.status !== 'void' && nota.status !== 'accepted' && (
            <Button variant="destructive" onClick={handleAnular}>
              <XCircle className="h-4 w-4 mr-2" />
              Anular
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
                  Factura de Origen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Número de Factura</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {nota.related_invoice.number}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Factura</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(Number(nota.related_invoice.total))}
                    </p>
                  </div>
                  <Link href={`/app/finanzas/facturas-venta/${nota.related_invoice_id}`}>
                    <Button variant="outline" size="sm" className="dark:border-gray-600">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Factura
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
                Detalle de Items
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ItemsDetalle items={nota.items || []} taxIncluded={nota.tax_included || false} organizationTaxes={organizationTaxes} />

              {/* Totals */}
              <div className="border-t dark:border-gray-700 p-4 space-y-2 mt-4">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Subtotal</span>
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
                      taxGroups[key] = { rate, amount: 0, name: orgTax?.name || `Impuesto ${rate}%` };
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
                        <span>Impuestos {nota.tax_included ? '(incluidos)' : '(adicionales)'}</span>
                        <span>{formatCurrency(taxTotal)}</span>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1">
                      {groups.map(g => (
                        <div key={g.rate} className="flex justify-between text-gray-600 dark:text-gray-300">
                          <span>{g.name} {nota.tax_included ? '(incl.)' : '(+imp.)'}</span>
                          <span>-{formatCurrency(g.amount)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <Separator className="dark:bg-gray-700" />
                <div className="flex justify-between text-lg font-bold text-red-600 dark:text-red-400">
                  <span>Total Nota Crédito</span>
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
                  Estado Facturación Electrónica
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Estado DIAN</p>
                    <Badge className={eInvoiceStatusColors[eInvoiceJob.status]}>
                      {eInvoiceStatusLabels[eInvoiceJob.status] || eInvoiceJob.status}
                    </Badge>
                  </div>
                  {eInvoiceJob.cufe && (
                    <div className="text-right">
                      <p className="text-sm text-gray-500 dark:text-gray-400">CUFE</p>
                      <p className="font-mono text-xs text-gray-900 dark:text-white max-w-[200px] truncate">
                        {eInvoiceJob.cufe}
                      </p>
                    </div>
                  )}
                </div>

                {eInvoiceEvents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Historial de Eventos
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
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {nota.customer ? (
                <>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {`${nota.customer.first_name || ''} ${nota.customer.last_name || ''}`.trim() || 'Sin nombre'}
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
                <p className="text-gray-500 dark:text-gray-400">Sin cliente asignado</p>
              )}
            </CardContent>
          </Card>

          {/* Info */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FileText className="h-5 w-5" />
                Información
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Número</p>
                <p className="font-medium text-gray-900 dark:text-white">{nota.number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Fecha Emisión</p>
                <p className="text-gray-900 dark:text-white">{formatDate(nota.issue_date)}</p>
              </div>
              {nota.reference_code && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Código Referencia</p>
                  <p className="text-gray-900 dark:text-white">{nota.reference_code}</p>
                </div>
              )}
              {nota.notes && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Notas</p>
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                    {nota.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Card */}
          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
            <CardContent className="pt-6">
              <p className="text-red-100 text-sm">Total Nota Crédito</p>
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
