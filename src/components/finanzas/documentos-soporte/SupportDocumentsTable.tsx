'use client';

import React from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, FileCheck2 } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/utils/Utils';
import { TableSkeleton } from '@/components/common/PageSkeletons';

export interface SupportDocumentRow {
  id: string;
  reference_code: string;
  number: string | null;
  issue_date: string;
  total: number;
  status: string;
  cufe: string | null;
  is_validated: boolean;
  validated_at: string | null;
  supplier_id: number | null;
  invoice_purchase_id: string | null;
  provider: {
    names?: string;
    identification?: string;
  } | null;
  created_at: string;
  supplier?: { id: number; name: string; nit: string } | null;
}

interface SupportDocumentsTableProps {
  documents: SupportDocumentRow[];
  isLoading: boolean;
}

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  processing: { label: 'Procesando', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  sent: { label: 'Enviado', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  accepted: { label: 'Aceptado', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Rechazado', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  failed: { label: 'Fallido', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-500' },
};

export function SupportDocumentsTable({ documents, isLoading }: SupportDocumentsTableProps) {
  if (isLoading) {
    return <TableSkeleton columns={6} rows={5} />;
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <FileCheck2 className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No hay documentos soporte</p>
        <p className="text-sm">
          Crea tu primer documento soporte para enviarlo a la DIAN
        </p>
        <Link href="/app/finanzas/documentos-soporte/nuevo" className="mt-4">
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
            Crear Documento Soporte
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead className="font-semibold">Referencia</TableHead>
            <TableHead className="font-semibold">Proveedor</TableHead>
            <TableHead className="font-semibold">Fecha</TableHead>
            <TableHead className="font-semibold text-right">Total</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold">CUFE</TableHead>
            <TableHead className="text-right font-semibold">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => {
            const status = statusConfig[doc.status] || statusConfig.draft;
            const providerName = doc.provider?.names || doc.supplier?.name || 'N/A';
            const providerId = doc.provider?.identification || doc.supplier?.nit || '';

            return (
              <TableRow
                key={doc.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span>{doc.reference_code}</span>
                    {doc.number && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        No. {doc.number}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="break-words whitespace-normal min-w-0">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{providerName}</span>
                    {providerId && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {providerId}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                  {formatDate(doc.issue_date)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(doc.total || 0)}
                </TableCell>
                <TableCell>
                  <Badge className={cn('font-medium', status.className)}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {doc.cufe ? (
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {doc.cufe.substring(0, 12)}...
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/app/finanzas/documentos-soporte/${doc.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default SupportDocumentsTable;
