'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialogo, RowActionsMenu, StatusBadge } from '@/components/kit';
import { Eye, Pencil, Copy, Trash2, Printer, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { CotizacionesService, type Quotation, type QuotationFilters } from '@/lib/services/cotizacionesService';
import { CopyableId } from '@/components/common/CopyableId';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';

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

interface CotizacionesTableProps {
  filtros?: QuotationFilters;
}

export function CotizacionesTable({ filtros }: CotizacionesTableProps) {
  const router = useRouter();
  // Imprimir y PDF salen del motor único de documentos (plantilla de marca, datos leídos en el servidor).
  const ta = useTranslations('accionesDocumento');
  const tc = useTranslations('documentosVenta.cotizaciones');
  // `issue_date` y `valid_until` son columnas `date`: se pintan sin convertir de zona.
  const { formatPlain } = useFormatDate();
  const formatearFecha = (fecha: string | null | undefined) => (fecha ? formatPlain(fecha) : 'N/A');
  const { toast } = useToast();
  const [cotizaciones, setCotizaciones] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [aEliminar, setAEliminar] = useState<Quotation | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const organizationId = getOrganizationId();
  const { branchFilter } = useBranch();
  // Cada cotización en su moneda (`quotations.currency`); sin ella, la base de la organización.
  const { paraDocumento } = useMonedaOrganizacion();

  const cargarCotizaciones = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const data = await CotizacionesService.listQuotations(organizationId, filtros, branchFilter);
      setCotizaciones(data);
    } catch (error) {
      console.error('Error loading quotations:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las cotizaciones.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, filtros, toast, branchFilter]);

  useEffect(() => {
    cargarCotizaciones();
  }, [cargarCotizaciones]);

  const handleDuplicar = async (id: string) => {
    try {
      const nueva = await CotizacionesService.duplicateQuotation(id);
      toast({ title: 'Cotización duplicada', description: `Nueva cotización ${nueva?.number}` });
      cargarCotizaciones();
    } catch (error: unknown) {
      toast({ title: 'Error', description: (error as { message?: string }).message, variant: 'destructive' });
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await CotizacionesService.deleteQuotation(aEliminar.id);
      toast({ title: 'Cotización eliminada' });
      cargarCotizaciones();
    } catch (error: unknown) {
      toast({ title: 'Error', description: (error as { message?: string }).message, variant: 'destructive' });
    } finally {
      setEliminando(false);
      setAEliminar(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (cotizaciones.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p>No hay cotizaciones para mostrar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="w-[120px]">Número</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="w-[100px]">Emisión</TableHead>
            <TableHead className="w-[100px]">Válida hasta</TableHead>
            <TableHead className="w-[120px] text-right">Total</TableHead>
            <TableHead className="w-[100px]">Estado</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cotizaciones.map((cot) => (
            <TableRow
              key={cot.id}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
              onClick={() => router.push(`/app/finanzas/cotizaciones/${cot.id}`)}
            >
              <TableCell className="font-medium">
                <CopyableId
                  label={cot.number}
                  copyValue={cot.number}
                  onClick={() => router.push(`/app/finanzas/cotizaciones/${cot.id}`)}
                  iconSize={12}
                />
              </TableCell>
              <TableCell className="text-gray-900 dark:text-gray-100">
                {cot.customers?.full_name || 'N/A'}
              </TableCell>
              <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                {formatearFecha(cot.issue_date)}
              </TableCell>
              <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                {formatearFecha(cot.valid_until)}
              </TableCell>
              <TableCell className="text-right font-medium text-gray-900 dark:text-gray-100">
                {formatMoneda(cot.total, paraDocumento(cot.currency))}
              </TableCell>
              <TableCell>
                {/* `expired` no está en la tabla de estados del kit; «vencida» sí (peligro). */}
                <StatusBadge estado={cot.status === 'expired' ? 'vencida' : cot.status} etiqueta={getStatusText(cot.status)} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <RowActionsMenu
                  titulo={cot.number}
                  acciones={[
                    { id: 'ver', etiqueta: 'Ver detalle', icono: Eye, onSelect: () => router.push(`/app/finanzas/cotizaciones/${cot.id}`) },
                    { id: 'imprimir', etiqueta: ta('imprimir'), icono: Printer, onSelect: () => imprimirDocumento('cotizacion', cot.id) },
                    { id: 'pdf', etiqueta: ta('verPdf'), icono: FileText, onSelect: () => abrirDocumento('cotizacion', cot.id) },
                    {
                      id: 'editar',
                      etiqueta: 'Editar',
                      icono: Pencil,
                      onSelect: () => router.push(`/app/finanzas/cotizaciones/${cot.id}/editar`),
                      oculta: cot.status !== 'draft' && cot.status !== 'sent',
                    },
                    { id: 'duplicar', etiqueta: 'Duplicar', icono: Copy, onSelect: () => void handleDuplicar(cot.id) },
                    { id: 'eliminar', etiqueta: 'Eliminar', icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setAEliminar(cot), oculta: cot.status !== 'draft' },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialogo
        abierto={aEliminar !== null}
        onAbiertoChange={(v) => !v && !eliminando && setAEliminar(null)}
        titulo={tc('eliminar.titulo', { numero: aEliminar?.number ?? '' })}
        descripcion={tc('eliminar.descripcion')}
        ancho={440}
        primario={{ etiqueta: tc('eliminar.confirmar'), onClick: () => void handleEliminar(), destructiva: true, cargando: eliminando }}
      />
    </div>
  );
}
