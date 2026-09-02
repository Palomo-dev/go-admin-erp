'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  FileDown,
  FileText,
  Trash2,
  RefreshCw,
  Loader2,
  Building2,
  Calendar,
  Hash,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate, cn } from '@/utils/Utils';
import { SendSupportDocumentButton } from '@/components/finanzas/documentos-soporte/SendSupportDocumentButton';

interface SupportDocumentDetailData {
  id: string;
  reference_code: string;
  number: string | null;
  issue_date: string;
  created_time: string | null;
  observation: string | null;
  payment_details: any[];
  provider: any;
  subtotal: number;
  tax_total: number;
  total: number;
  status: string;
  cufe: string | null;
  is_validated: boolean;
  validated_at: string | null;
  error_message: string | null;
  factus_response: any;
  supplier_id: number | null;
  invoice_purchase_id: string | null;
  created_at: string;
  items: Array<{
    id: string;
    description: string;
    qty: number;
    unit_price: number;
    tax_rate: number;
    discount_rate: number;
    total_line: number;
    code_reference: string | null;
    is_excluded: number;
  }>;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  processing: { label: 'Procesando', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  sent: { label: 'Enviado', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  accepted: { label: 'Aceptado', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Rechazado', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  failed: { label: 'Fallido', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-500' },
};

interface SupportDocumentDetailProps {
  documentId: string;
}

export function SupportDocumentDetail({ documentId }: SupportDocumentDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [doc, setDoc] = useState<SupportDocumentDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<'pdf' | 'xml' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
  }, []);

  const loadDocument = useCallback(async () => {
    if (!organizationId || !documentId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_documents')
        .select('*')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        toast({ title: 'Error', description: 'Documento no encontrado', variant: 'destructive' });
        router.push('/app/finanzas/documentos-soporte');
        return;
      }

      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('support_document_id', documentId)
        .order('created_at', { ascending: true });

      setDoc({ ...data, items: items || [] });
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, documentId, router, toast]);

  useEffect(() => {
    if (organizationId) loadDocument();
  }, [organizationId, loadDocument]);

  const handleDownload = async (type: 'pdf' | 'xml') => {
    if (!doc?.number) {
      toast({
        title: 'Sin número',
        description: 'El documento no tiene número asignado por DIAN aún',
        variant: 'destructive',
      });
      return;
    }
    setIsDownloading(type);
    try {
      const res = await fetch(
        `/api/factus/support-document/download?type=${type}&number=${doc.number}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error descargando');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `documento-soporte-${doc.number}.${type}`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: 'Descarga completada', description: `Archivo ${type.toUpperCase()} descargado` });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo descargar',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDelete = async () => {
    if (!doc || !['draft', 'failed', 'rejected'].includes(doc.status)) {
      toast({
        title: 'No se puede eliminar',
        description: 'Solo se pueden eliminar documentos en borrador, fallidos o rechazados',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('¿Eliminar este documento soporte? Esta acción no se puede deshacer.')) return;

    setIsDeleting(true);
    try {
      // Si fue enviado a Factus pero no validado, eliminar de Factus primero
      if (doc.status === 'failed' || doc.status === 'rejected') {
        try {
          await fetch(
            `/api/factus/support-document?ref=${doc.reference_code}&organizationId=${organizationId}`,
            { method: 'DELETE' }
          );
        } catch {
          // Continuar aunque falle el delete en Factus
        }
      }

      const { error } = await supabase
        .from('support_documents')
        .delete()
        .eq('id', documentId)
        .eq('organization_id', organizationId);

      if (error) throw error;

      toast({ title: 'Documento eliminado' });
      router.push('/app/finanzas/documentos-soporte');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!doc) return null;

  const status = statusConfig[doc.status] || statusConfig.draft;
  const canSendToDian = ['draft', 'failed', 'rejected'].includes(doc.status);
  const canDownload = doc.status === 'accepted' && doc.number;
  const canDelete = ['draft', 'failed', 'rejected'].includes(doc.status);
  const provider = doc.provider || {};

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/app/finanzas/documentos-soporte"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Documento Soporte
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ref: {doc.reference_code}
              {doc.number && ` — No. ${doc.number}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn('font-medium', status.className)}>{status.label}</Badge>
        </div>
      </div>

      {/* Error message */}
      {doc.error_message && (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-4">
            <p className="text-sm text-red-800 dark:text-red-400">
              <strong>Error:</strong> {doc.error_message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Info general + proveedor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-600" />
              Información General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Fecha emisión" value={formatDate(doc.issue_date)} />
            {doc.created_time && (
              <InfoRow label="Hora creación" value={doc.created_time} />
            )}
            {doc.validated_at && (
              <InfoRow label="Validado DIAN" value={formatDate(doc.validated_at)} />
            )}
            {doc.cufe && (
              <InfoRow label="CUFE" value={doc.cufe} mono />
            )}
            {doc.observation && (
              <InfoRow label="Observación" value={doc.observation} />
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-600" />
              Proveedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Nombre" value={provider.names || 'N/A'} />
            <InfoRow label="Identificación" value={provider.identification || 'N/A'} />
            {provider.dv && <InfoRow label="DV" value={provider.dv} />}
            {provider.address && <InfoRow label="Dirección" value={provider.address} />}
            {provider.email && <InfoRow label="Email" value={provider.email} />}
            {provider.phone && <InfoRow label="Teléfono" value={provider.phone} />}
            {provider.country_code && <InfoRow label="País" value={provider.country_code} />}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4 text-purple-600" />
            Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">Código</TableHead>
                <TableHead className="font-semibold">Descripción</TableHead>
                <TableHead className="font-semibold text-right">Cant.</TableHead>
                <TableHead className="font-semibold text-right">Precio</TableHead>
                <TableHead className="font-semibold text-right">Desc.</TableHead>
                <TableHead className="font-semibold text-right">IVA</TableHead>
                <TableHead className="font-semibold text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">
                    {item.code_reference || '-'}
                  </TableCell>
                  <TableCell className="break-words whitespace-normal">
                    {item.description}
                  </TableCell>
                  <TableCell className="text-right">{Number(item.qty).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(item.unit_price))}
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(item.discount_rate || 0).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {item.is_excluded ? 'Excl.' : `${Number(item.tax_rate || 0)}%`}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Number(item.total_line))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Totales */}
          <div className="flex justify-end mt-4">
            <div className="w-full sm:w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-medium">{formatCurrency(doc.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">IVA:</span>
                <span className="font-medium">{formatCurrency(doc.tax_total)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2 dark:border-gray-700">
                <span>Total:</span>
                <span>{formatCurrency(doc.total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex flex-wrap gap-3 justify-end">
        <Button variant="outline" onClick={() => loadDocument()} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>

        {canDelete && (
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Eliminar
          </Button>
        )}

        {canDownload && (
          <>
            <Button
              variant="outline"
              onClick={() => handleDownload('pdf')}
              disabled={isDownloading !== null}
            >
              {isDownloading === 'pdf' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDownload('xml')}
              disabled={isDownloading !== null}
            >
              {isDownloading === 'xml' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              XML
            </Button>
          </>
        )}

        {canSendToDian && (
          <SendSupportDocumentButton
            organizationId={organizationId}
            supportDocumentId={documentId}
            onSent={loadDocument}
          />
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 dark:text-gray-400">{label}:</span>
      <span
        className={`text-right font-medium text-gray-900 dark:text-white break-all ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default SupportDocumentDetail;

