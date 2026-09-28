'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
import { cn } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
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
  /** Moneda del documento (si la consulta la trae); sin ella, la base de la organización. */
  currency?: string | null;
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

/** Clase del badge por estado; la etiqueta sale de `documentosSoporte.estados`. */
const statusConfig: Record<string, { className: string }> = {
  draft: { className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  pending: { className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  processing: { className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  sent: { className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  accepted: { className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  failed: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-500' },
};

export function SupportDocumentsTable({ documents, isLoading }: SupportDocumentsTableProps) {
  const { paraDocumento } = useMonedaOrganizacion();
  const t = useTranslations('documentosSoporte');
  const { formatDate } = useFormatDate();
  if (isLoading) {
    return <TableSkeleton columns={6} rows={5} />;
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <FileCheck2 className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">{t('tabla.vacioTitulo')}</p>
        <p className="text-sm">
          {t('tabla.vacioDescripcion')}
        </p>
        <Link href="/app/finanzas/documentos-soporte/nuevo" className="mt-4">
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
            {t('tabla.crear')}
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
            <TableHead className="font-semibold">{t('tabla.columnas.referencia')}</TableHead>
            <TableHead className="font-semibold">{t('tabla.columnas.proveedor')}</TableHead>
            <TableHead className="font-semibold">{t('tabla.columnas.fecha')}</TableHead>
            <TableHead className="font-semibold text-right">{t('tabla.columnas.total')}</TableHead>
            <TableHead className="font-semibold">{t('tabla.columnas.estado')}</TableHead>
            <TableHead className="font-semibold">{t('tabla.columnas.cufe')}</TableHead>
            <TableHead className="text-right font-semibold">{t('tabla.columnas.acciones')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => {
            const estado = statusConfig[doc.status] ? doc.status : 'draft';
            const status = statusConfig[estado];
            const providerName = doc.provider?.names || doc.supplier?.name || t('tabla.noDisponible');
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
                        {t('tabla.numero', { numero: doc.number })}
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
                  {formatMoneda(doc.total || 0, paraDocumento(doc.currency))}
                </TableCell>
                <TableCell>
                  <Badge className={cn('font-medium', status.className)}>
                    {t(`estados.${estado}` as never)}
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
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('tabla.verDetalle')}>
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
