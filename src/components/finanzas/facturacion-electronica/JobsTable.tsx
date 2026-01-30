'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  RefreshCw,
  XCircle,
  Eye,
  FileDown,
  FileText,
  Loader2,
} from 'lucide-react';
import { formatDate, cn } from '@/utils/Utils';

export interface ElectronicInvoicingJob {
  id: string;
  organization_id: number;
  invoice_id: string;
  document_type: string;
  provider: string;
  status: 'pending' | 'processing' | 'sent' | 'accepted' | 'rejected' | 'failed' | 'cancelled';
  attempt_count: number;
  max_attempts: number;
  cufe?: string;
  qr_code?: string;
  error_code?: string;
  error_message?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
  invoice?: {
    id: string;
    number: string;
    total: number;
    customer?: {
      first_name?: string;
      last_name?: string;
      company_name?: string;
    };
  };
}

interface JobsTableProps {
  jobs: ElectronicInvoicingJob[];
  isLoading: boolean;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onViewDetails: (job: ElectronicInvoicingJob) => void;
  onDownloadPDF: (job: ElectronicInvoicingJob) => void;
  onDownloadXML: (job: ElectronicInvoicingJob) => void;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  pending: { label: 'Pendiente', variant: 'secondary', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  processing: { label: 'Procesando', variant: 'secondary', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  sent: { label: 'Enviado', variant: 'secondary', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  accepted: { label: 'Aceptado', variant: 'default', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Rechazado', variant: 'destructive', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  failed: { label: 'Fallido', variant: 'destructive', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelado', variant: 'outline', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400' },
};

const documentTypeLabels: Record<string, string> = {
  invoice: 'Factura',
  credit_note: 'Nota Crédito',
  debit_note: 'Nota Débito',
  support_document: 'Doc. Soporte',
};

export function JobsTable({
  jobs,
  isLoading,
  onRetry,
  onCancel,
  onViewDetails,
  onDownloadPDF,
  onDownloadXML,
}: JobsTableProps) {
  const getCustomerName = (job: ElectronicInvoicingJob): string => {
    if (!job.invoice?.customer) return 'N/A';
    const { first_name, last_name, company_name } = job.invoice.customer;
    if (company_name) return company_name;
    return `${first_name || ''} ${last_name || ''}`.trim() || 'N/A';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando jobs...</span>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No hay jobs de facturación electrónica</p>
        <p className="text-sm">Los jobs aparecerán aquí cuando envíes facturas a la DIAN</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead className="font-semibold">Factura</TableHead>
            <TableHead className="font-semibold">Cliente</TableHead>
            <TableHead className="font-semibold">Tipo</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold">CUFE</TableHead>
            <TableHead className="font-semibold">Intentos</TableHead>
            <TableHead className="font-semibold">Fecha</TableHead>
            <TableHead className="text-right font-semibold">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const status = statusConfig[job.status] || statusConfig.pending;
            const canRetry = ['failed', 'rejected'].includes(job.status) && job.attempt_count < job.max_attempts;
            const canCancel = ['pending', 'processing'].includes(job.status);
            const canDownload = job.status === 'accepted' && job.cufe;

            return (
              <TableRow 
                key={job.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <TableCell className="font-medium">
                  {job.invoice?.number || job.invoice_id.substring(0, 8)}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {getCustomerName(job)}
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {documentTypeLabels[job.document_type] || job.document_type}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className={cn('font-medium', status.className)}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {job.cufe ? (
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {job.cufe.substring(0, 12)}...
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={cn(
                    'text-sm',
                    job.attempt_count >= job.max_attempts ? 'text-red-600 dark:text-red-400' : ''
                  )}>
                    {job.attempt_count}/{job.max_attempts}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                  {formatDate(job.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onViewDetails(job)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalles
                      </DropdownMenuItem>
                      {canDownload && (
                        <>
                          <DropdownMenuItem onClick={() => onDownloadPDF(job)}>
                            <FileDown className="h-4 w-4 mr-2" />
                            Descargar PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDownloadXML(job)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Descargar XML
                          </DropdownMenuItem>
                        </>
                      )}
                      {canRetry && (
                        <DropdownMenuItem onClick={() => onRetry(job.id)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reintentar
                        </DropdownMenuItem>
                      )}
                      {canCancel && (
                        <DropdownMenuItem 
                          onClick={() => onCancel(job.id)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancelar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default JobsTable;
