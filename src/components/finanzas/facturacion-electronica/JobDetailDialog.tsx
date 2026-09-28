'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileDown,
  FileText,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Code2,
  ChevronDown,
  ChevronRight,
  Building2,
  User,
  Calendar,
  Hash,
  Receipt,
  QrCode,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useToast } from '@/components/ui/use-toast';
import { TIPOS_DOCUMENTO_FE, type ElectronicInvoicingJob } from './JobsTable';
import { JobEventsTimeline } from './JobEventsTimeline';

interface JobDetailDialogProps {
  job: ElectronicInvoicingJob | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadPDF: (job: ElectronicInvoicingJob) => void;
  onDownloadXML: (job: ElectronicInvoicingJob) => void;
}

/** Icono y color por estado; la etiqueta sale de `facturacionElectronica.estadosDetalle`. */
const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  accepted: { icon: <CheckCircle2 className="h-5 w-5 text-green-600" />, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { icon: <XCircle className="h-5 w-5 text-red-600" />, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  failed: { icon: <AlertTriangle className="h-5 w-5 text-red-600" />, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  pending: { icon: <Clock className="h-5 w-5 text-yellow-600" />, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  processing: { icon: <Clock className="h-5 w-5 text-blue-600 animate-pulse" />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  sent: { icon: <Clock className="h-5 w-5 text-blue-600" />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
};

function InfoRow({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {icon && <div className="text-gray-400 mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className={cn('text-sm text-gray-900 dark:text-gray-100 break-words', mono && 'font-mono text-xs break-all')}>
          {value || '—'}
        </p>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: { title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        {icon}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
      </button>
      {open && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function JobDetailDialog({
  job,
  isOpen,
  onClose,
  onDownloadPDF,
  onDownloadXML,
}: JobDetailDialogProps) {
  const { toast } = useToast();
  const t = useTranslations('facturacionElectronica');
  const { formatDate } = useFormatDate();
  const { formatear } = useMonedaOrganizacion();

  if (!job) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('trabajos.detalle.copiadoTitulo'), description: t('trabajos.detalle.copiadoDescripcion', { elemento: label }) });
  };

  const canDownload = job.status === 'accepted' && job.cufe;
  const estado = statusConfig[job.status] ? job.status : 'pending';
  const status = statusConfig[estado];
  const noDisponible = t('trabajos.noDisponible');
  const responseData = job.response_payload?.data;
  const factusNumber = responseData?.number;
  const customerName = job.invoice?.customer
    ? `${job.invoice.customer.first_name || ''} ${job.invoice.customer.last_name || ''}`.trim() || job.invoice.customer.company_name || noDisponible
    : noDisponible;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            {status.icon}
            <span>{t('trabajos.detalle.titulo')}</span>
            <Badge className={status.color}>{t(`estadosDetalle.${estado}` as never)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header tipo factura */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-2">
                    <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('trabajos.detalle.facturaNo')}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{job.invoice?.number || noDisponible}</p>
                  </div>
                </div>
                {factusNumber && (
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('trabajos.detalle.noDian')}</p>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 font-mono">{factusNumber}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
              <InfoRow icon={<User className="h-4 w-4" />} label={t('trabajos.detalle.cliente')} value={customerName} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label={t('trabajos.detalle.fechaEnvio')} value={formatDate(job.created_at)} />
              <InfoRow icon={<Hash className="h-4 w-4" />} label={t('trabajos.detalle.tipoDocumento')} value={TIPOS_DOCUMENTO_FE.has(job.document_type) ? t(`tiposDocumento.${job.document_type}` as never) : job.document_type.replace('_', ' ')} />
              <InfoRow icon={<Building2 className="h-4 w-4" />} label={t('trabajos.detalle.proveedor')} value={job.provider} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label={t('trabajos.detalle.intentos')} value={t('trabajos.detalle.intentosDe', { intentos: job.attempt_count, maximo: job.max_attempts })} />
              {job.invoice?.total != null && (
                <InfoRow icon={<Receipt className="h-4 w-4" />} label={t('trabajos.detalle.total')} value={formatear(Number(job.invoice.total))} />
              )}
            </div>
          </div>

          {/* CUFE y QR lado a lado */}
          {(job.cufe || job.qr_code) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {job.cufe && (
                <div className={cn(
                  "rounded-xl border border-gray-200 dark:border-gray-700 p-4",
                  job.qr_code ? "lg:col-span-2" : "lg:col-span-3"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('trabajos.detalle.cufe')}</span>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(job.cufe!, 'CUFE')} className="h-6 px-2" aria-label={t('trabajos.detalle.copiar')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded-lg break-all text-gray-700 dark:text-gray-300">
                    {job.cufe}
                  </p>
                </div>
              )}
              {job.qr_code && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-2 mb-3">
                    <QrCode className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('trabajos.detalle.qr')}</span>
                  </div>
                  {/* El QR lo entrega Factus y se muestra tal cual, sin pasar por next/image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={job.qr_code} alt={t('trabajos.detalle.qrAlt')} className="w-32 h-32" />
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {job.error_message && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-800 dark:text-red-400">{t('trabajos.detalle.errorValidacion')}</span>
              </div>
              {job.error_code && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-1">{t('trabajos.detalle.codigo', { codigo: job.error_code })}</p>
              )}
              <p className="text-sm text-red-700 dark:text-red-300 break-words">{job.error_message}</p>
            </div>
          )}

          {/* Datos de la factura desde response */}
          {responseData && (
            <CollapsibleSection title={t('trabajos.detalle.datosValidada')} icon={<Receipt className="h-4 w-4 text-gray-400" />} defaultOpen>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                <InfoRow label={t('trabajos.detalle.numeroDian')} value={responseData.number} mono />
                <InfoRow label={t('trabajos.detalle.fechaValidacion')} value={responseData.validated_at} />
                <InfoRow label={t('trabajos.detalle.prefijo')} value={responseData.prefix} />
                <InfoRow label={t('trabajos.detalle.consecutivo')} value={responseData.number} />
                <InfoRow label={t('trabajos.detalle.estadoDian')} value={responseData.status || 'valid'} />
                {responseData.errors && Array.isArray(responseData.errors) && responseData.errors.length > 0 && (
                  <InfoRow label={t('trabajos.detalle.erroresDian')} value={responseData.errors.join(', ')} />
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Timeline de eventos */}
          <CollapsibleSection title={t('trabajos.detalle.historial')} icon={<Clock className="h-4 w-4 text-gray-400" />} defaultOpen>
            <JobEventsTimeline jobId={job.id} />
          </CollapsibleSection>

          {/* Request enviado a Factus - colapsable */}
          {job.request_payload && Object.keys(job.request_payload).length > 0 && (
            <CollapsibleSection title={t('trabajos.detalle.enviados')} icon={<Code2 className="h-4 w-4 text-gray-400" />}>
              <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                {JSON.stringify(job.request_payload, null, 2)}
              </pre>
            </CollapsibleSection>
          )}

          {/* Response de Factus - colapsable */}
          {job.response_payload && (
            <CollapsibleSection title={t('trabajos.detalle.respuesta')} icon={<Code2 className="h-4 w-4 text-gray-400" />}>
              <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                {JSON.stringify(job.response_payload, null, 2)}
              </pre>
            </CollapsibleSection>
          )}

          {/* Acciones */}
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            {canDownload && (
              <>
                <Button variant="outline" onClick={() => onDownloadPDF(job)} className="flex items-center gap-2 w-full sm:w-auto justify-center">
                  <FileDown className="h-4 w-4" />
                  {t('trabajos.detalle.descargarPdf')}
                </Button>
                <Button variant="outline" onClick={() => onDownloadXML(job)} className="flex items-center gap-2 w-full sm:w-auto justify-center">
                  <FileText className="h-4 w-4" />
                  {t('trabajos.detalle.descargarXml')}
                </Button>
              </>
            )}
            <Button variant="default" onClick={onClose} className="w-full sm:w-auto">
              {t('trabajos.detalle.cerrar')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default JobDetailDialog;
