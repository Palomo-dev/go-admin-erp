'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FileDown,
  FileText,
  Copy,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { formatDate, cn } from '@/utils/Utils';
import { useToast } from '@/components/ui/use-toast';
import type { ElectronicInvoicingJob } from './JobsTable';

interface JobDetailDialogProps {
  job: ElectronicInvoicingJob | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadPDF: (job: ElectronicInvoicingJob) => void;
  onDownloadXML: (job: ElectronicInvoicingJob) => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  accepted: <CheckCircle2 className="h-5 w-5 text-green-600" />,
  rejected: <XCircle className="h-5 w-5 text-red-600" />,
  failed: <AlertTriangle className="h-5 w-5 text-red-600" />,
  pending: <Clock className="h-5 w-5 text-yellow-600" />,
  processing: <Clock className="h-5 w-5 text-blue-600 animate-pulse" />,
};

export function JobDetailDialog({
  job,
  isOpen,
  onClose,
  onDownloadPDF,
  onDownloadXML,
}: JobDetailDialogProps) {
  const { toast } = useToast();

  if (!job) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado',
      description: `${label} copiado al portapapeles`,
    });
  };

  const canDownload = job.status === 'accepted' && job.cufe;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {statusIcons[job.status]}
            <span>Detalle de Factura Electrónica</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información General */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Número de Factura
              </label>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {job.invoice?.number || job.invoice_id.substring(0, 8)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Estado
              </label>
              <Badge className={cn(
                'mt-1',
                job.status === 'accepted' && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                job.status === 'rejected' && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
                job.status === 'failed' && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
                job.status === 'pending' && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
                job.status === 'processing' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
              )}>
                {job.status.toUpperCase()}
              </Badge>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Proveedor
              </label>
              <p className="font-medium text-gray-900 dark:text-white capitalize">
                {job.provider}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Tipo de Documento
              </label>
              <p className="font-medium text-gray-900 dark:text-white capitalize">
                {job.document_type.replace('_', ' ')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Fecha de Envío
              </label>
              <p className="text-gray-900 dark:text-white">
                {formatDate(job.created_at)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Intentos
              </label>
              <p className={cn(
                'font-medium',
                job.attempt_count >= job.max_attempts 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-gray-900 dark:text-white'
              )}>
                {job.attempt_count} de {job.max_attempts}
              </p>
            </div>
          </div>

          <Separator />

          {/* CUFE */}
          {job.cufe && (
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                CUFE (Código Único de Factura Electrónica)
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(job.cufe!, 'CUFE')}
                  className="h-6 px-2"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </label>
              <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded-lg mt-1 break-all">
                {job.cufe}
              </p>
            </div>
          )}

          {/* QR Code */}
          {job.qr_code && (
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Código QR
              </label>
              <div className="mt-2 flex justify-center p-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                <img 
                  src={job.qr_code} 
                  alt="Código QR" 
                  className="w-40 h-40"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {job.error_message && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <label className="text-sm font-medium text-red-800 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Error
              </label>
              {job.error_code && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  Código: {job.error_code}
                </p>
              )}
              <p className="text-red-700 dark:text-red-300 mt-1">
                {job.error_message}
              </p>
            </div>
          )}

          <Separator />

          {/* Acciones */}
          <div className="flex justify-end gap-2">
            {canDownload && (
              <>
                <Button
                  variant="outline"
                  onClick={() => onDownloadPDF(job)}
                  className="flex items-center gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Descargar PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onDownloadXML(job)}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Descargar XML
                </Button>
              </>
            )}
            <Button variant="default" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default JobDetailDialog;
