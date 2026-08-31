'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Eye, Pencil, Copy, FileCheck2, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { CotizacionesService, type Quotation, type QuotationFilters } from '@/lib/services/cotizacionesService';

const formatearFecha = (fechaStr: string | null | undefined): string => {
  if (!fechaStr) return 'N/A';
  try {
    const partes = fechaStr.split('T')[0].split('-');
    if (partes.length !== 3) return fechaStr;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  } catch {
    return fechaStr || 'N/A';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    case 'sent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'accepted': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'expired': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'converted': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

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
  const { toast } = useToast();
  const [cotizaciones, setCotizaciones] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const organizationId = getOrganizationId();

  const cargarCotizaciones = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const data = await CotizacionesService.listQuotations(organizationId, filtros);
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
  }, [organizationId, filtros, toast]);

  useEffect(() => {
    cargarCotizaciones();
  }, [cargarCotizaciones]);

  const handleDuplicar = async (id: string) => {
    try {
      const nueva = await CotizacionesService.duplicateQuotation(id);
      toast({ title: 'Cotización duplicada', description: `Nueva cotización ${nueva?.number}` });
      cargarCotizaciones();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta cotización?')) return;
    try {
      await CotizacionesService.deleteQuotation(id);
      toast({ title: 'Cotización eliminada' });
      cargarCotizaciones();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/app/finanzas/cotizaciones/${cot.id}`); }}
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer text-left font-medium"
                  title="Ver detalle"
                >
                  {cot.number}
                </button>
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
                {formatCurrency(cot.total)}
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(cot.status)}>
                  {getStatusText(cot.status)}
                </Badge>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <DropdownMenuItem onClick={() => router.push(`/app/finanzas/cotizaciones/${cot.id}`)}>
                      <Eye className="h-4 w-4 mr-2" /> Ver detalle
                    </DropdownMenuItem>
                    {(cot.status === 'draft' || cot.status === 'sent') && (
                      <DropdownMenuItem onClick={() => router.push(`/app/finanzas/cotizaciones/${cot.id}/editar`)}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleDuplicar(cot.id)}>
                      <Copy className="h-4 w-4 mr-2" /> Duplicar
                    </DropdownMenuItem>
                    {cot.status === 'draft' && (
                      <DropdownMenuItem
                        onClick={() => handleEliminar(cot.id)}
                        className="text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
