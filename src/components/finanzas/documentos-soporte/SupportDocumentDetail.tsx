'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  Printer,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { SendSupportDocumentButton } from '@/components/finanzas/documentos-soporte/SendSupportDocumentButton';
import { descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';

/** Proveedor tal como se guarda en `support_documents.provider` (jsonb). */
interface ProveedorSoporte {
  names?: string;
  identification?: string;
  dv?: string;
  address?: string;
  email?: string;
  phone?: string;
  country_code?: string;
}

interface SupportDocumentDetailData {
  id: string;
  reference_code: string;
  number: string | null;
  issue_date: string;
  created_time: string | null;
  observation: string | null;
  payment_details: unknown[];
  provider: ProveedorSoporte | null;
  subtotal: number;
  tax_total: number;
  total: number;
  status: string;
  cufe: string | null;
  is_validated: boolean;
  validated_at: string | null;
  error_message: string | null;
  factus_response: unknown;
  supplier_id: number | null;
  invoice_purchase_id: string | null;
  /** Moneda del documento; null = la base de la organización. */
  currency: string | null;
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

interface SupportDocumentDetailProps {
  documentId: string;
}

export function SupportDocumentDetail({ documentId }: SupportDocumentDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('documentosSoporte.detalle');
  const tEstados = useTranslations('documentosSoporte.estados');
  const ta = useTranslations('accionesDocumento');
  const { formatDate } = useFormatDate();
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [doc, setDoc] = useState<SupportDocumentDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<'pdf' | 'xml' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { paraDocumento } = useMonedaOrganizacion();

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
        toast({ title: t('toast.errorTitulo'), description: t('toast.noEncontrado'), variant: 'destructive' });
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
  }, [organizationId, documentId, router, toast, t]);

  useEffect(() => {
    if (organizationId) loadDocument();
  }, [organizationId, loadDocument]);

  // PDF de marca del motor único (`GET /api/documentos/documento-soporte/<id>`):
  // el servidor lee el documento con la organización de la sesión, con su CUDS
  // y el QR de la DIAN cuando ya fue aceptado. Sale también en borrador (con
  // marca de agua). El XML sigue siendo el de Factus.
  const handleDescargarPdf = async () => {
    if (!doc) return;
    setIsDownloading('pdf');
    try {
      await descargarDocumento('documento-soporte', doc.id);
    } catch (error: unknown) {
      toast({ title: ta('errorTitulo'), description: error instanceof Error && error.message ? error.message : ta('error'), variant: 'destructive' });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownload = async (type: 'xml') => {
    if (!doc?.number) {
      toast({
        title: t('toast.sinNumeroTitulo'),
        description: t('toast.sinNumeroDescripcion'),
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
        throw new Error(err.error || t('toast.errorDescarga'));
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
      toast({ title: t('toast.descargaTitulo'), description: t('toast.descargaDescripcion', { tipo: type.toUpperCase() }) });
    } catch (error: unknown) {
      toast({
        title: t('toast.errorTitulo'),
        description: (error as { message?: string }).message || t('toast.noDescargado'),
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDelete = async () => {
    if (!doc || !['draft', 'failed', 'rejected'].includes(doc.status)) {
      toast({
        title: t('toast.noEliminableTitulo'),
        description: t('toast.noEliminableDescripcion'),
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(t('confirmarEliminar'))) return;

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

      toast({ title: t('toast.eliminado') });
      router.push('/app/finanzas/documentos-soporte');
    } catch (error: unknown) {
      toast({
        title: t('toast.errorTitulo'),
        description: (error as { message?: string }).message || t('toast.noEliminado'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Celular: una sola barra. «←» y el título van en el MobileHeader del shell.
  useCabeceraMovil({ modo: 'page', titulo: t('titulo'), subtitulo: doc ? t('referencia', { referencia: doc.reference_code }) : undefined, volverA: '/app/finanzas/documentos-soporte' });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!doc) return null;

  const estado = statusConfig[doc.status] ? doc.status : 'draft';
  const status = statusConfig[estado];
  const canSendToDian = ['draft', 'failed', 'rejected'].includes(doc.status);
  const canDownload = doc.status === 'accepted' && doc.number;
  const canDelete = ['draft', 'failed', 'rejected'].includes(doc.status);
  const provider: ProveedorSoporte = doc.provider || {};
  // Importes en la moneda del documento soporte; sin ella, la base de la organización.
  const formatCurrency = crearFormateadorMoneda(paraDocumento(doc.currency));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* En celular «←» ya está en el MobileHeader del shell: aquí sería la segunda flecha. */}
          <Link
            href="/app/finanzas/documentos-soporte"
            className="hidden lg:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('volver')}
          >
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('titulo')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('referencia', { referencia: doc.reference_code })}
              {doc.number && t('numero', { numero: doc.number })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn('font-medium', status.className)}>{tEstados(estado as never)}</Badge>
        </div>
      </div>

      {/* Error message */}
      {doc.error_message && (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-4">
            <p className="text-sm text-red-800 dark:text-red-400">
              <strong>{t('error')}</strong> {doc.error_message}
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
              {t('infoGeneral')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label={t('fechaEmision')} value={formatDate(doc.issue_date)} />
            {doc.created_time && (
              <InfoRow label={t('horaCreacion')} value={doc.created_time} />
            )}
            {doc.validated_at && (
              <InfoRow label={t('validadoDian')} value={formatDate(doc.validated_at)} />
            )}
            {doc.cufe && (
              <InfoRow label={t('cufe')} value={doc.cufe} mono />
            )}
            {doc.observation && (
              <InfoRow label={t('observacion')} value={doc.observation} />
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-600" />
              {t('proveedor')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label={t('nombre')} value={provider.names || t('noDisponible')} />
            <InfoRow label={t('identificacion')} value={provider.identification || t('noDisponible')} />
            {provider.dv && <InfoRow label={t('dv')} value={provider.dv} />}
            {provider.address && <InfoRow label={t('direccion')} value={provider.address} />}
            {provider.email && <InfoRow label={t('email')} value={provider.email} />}
            {provider.phone && <InfoRow label={t('telefono')} value={provider.phone} />}
            {provider.country_code && <InfoRow label={t('pais')} value={provider.country_code} />}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4 text-purple-600" />
            {t('items')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">{t('columnas.codigo')}</TableHead>
                <TableHead className="font-semibold">{t('columnas.descripcion')}</TableHead>
                <TableHead className="font-semibold text-right">{t('columnas.cantidad')}</TableHead>
                <TableHead className="font-semibold text-right">{t('columnas.precio')}</TableHead>
                <TableHead className="font-semibold text-right">{t('columnas.descuento')}</TableHead>
                <TableHead className="font-semibold text-right">{t('columnas.iva')}</TableHead>
                <TableHead className="font-semibold text-right">{t('columnas.total')}</TableHead>
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
                    {item.is_excluded ? t('excluido') : `${Number(item.tax_rate || 0)}%`}
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
                <span className="text-gray-600 dark:text-gray-400">{t('subtotal')}</span>
                <span className="font-medium">{formatCurrency(doc.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t('ivaTotal')}</span>
                <span className="font-medium">{formatCurrency(doc.tax_total)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2 dark:border-gray-700">
                <span>{t('total')}</span>
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
          {t('actualizar')}
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
            {t('eliminar')}
          </Button>
        )}

        <Button variant="outline" onClick={() => imprimirDocumento('documento-soporte', doc.id)}>
          <Printer className="h-4 w-4 mr-2" />
          {ta('imprimir')}
        </Button>
        <Button variant="outline" onClick={handleDescargarPdf} disabled={isDownloading !== null}>
          {isDownloading === 'pdf' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4 mr-2" />
          )}
          PDF
        </Button>

        {canDownload && (
          <>
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

