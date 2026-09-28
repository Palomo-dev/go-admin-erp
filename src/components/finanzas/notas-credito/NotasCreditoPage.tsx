'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Download,
  Search,
  RefreshCw,
  ArrowLeft,
  FileText,
  MoreVertical,
  Eye,
  XCircle,
  Filter,
  Calendar,
  User,
  CheckCircle,
  Clock,
  AlertCircle,
  Printer,
} from 'lucide-react';
import {
  PageHeaderSkeleton,
  StatsSkeleton,
  CardListSkeleton,
} from '@/components/common/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { notasCreditoService, NotaCredito } from '@/lib/services/notasCreditoService';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { CopyableId } from '@/components/common/CopyableId';
import { BranchBadge } from '@/components/inventario/BranchBadge';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  void: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

/** Estados con etiqueta en `notasCredito.estados`. */
const ESTADOS_CONOCIDOS = new Set(['draft', 'pending', 'sent', 'accepted', 'rejected', 'void', 'paid']);

const statusIcons: Record<string, React.ReactNode> = {
  draft: <FileText className="h-3 w-3" />,
  pending: <Clock className="h-3 w-3" />,
  sent: <CheckCircle className="h-3 w-3" />,
  accepted: <CheckCircle className="h-3 w-3" />,
  rejected: <AlertCircle className="h-3 w-3" />,
  void: <XCircle className="h-3 w-3" />,
  paid: <CheckCircle className="h-3 w-3" />,
};

/** Cada nota es una fila de `invoice_sales` (select *): trae su propia `currency`. */
type NotaConMoneda = NotaCredito & { currency?: string | null };

export function NotasCreditoPage() {
  const router = useRouter();
  // KPIs que suman varias notas: moneda base. Cada nota: su propia moneda.
  const { formatear, paraDocumento } = useMonedaOrganizacion();
  const t = useTranslations('notasCredito');
  // Imprimir y PDF: motor único de documentos (plantilla de marca, datos leídos en el servidor).
  const ta = useTranslations('accionesDocumento');
  // issue_date es timestamptz: el día sale en la zona de la organización.
  const { formatDate, getToday } = useFormatDate();
  const etiquetaEstado = (estado: string) => (ESTADOS_CONOCIDOS.has(estado) ? t(`estados.${estado}`) : estado);
  const nombreCliente = (nota: NotaCredito) =>
    (nota.customer ? `${nota.customer.first_name || ''} ${nota.customer.last_name || ''}`.trim() : '') || t('comun.sinCliente');
  const [notas, setNotas] = useState<NotaCredito[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    total: 0,
    count: 0,
    thisMonth: 0,
    pending: 0,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: { status?: string; search?: string } = {};
      
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (searchTerm) {
        filters.search = searchTerm;
      }

      const [notasData, statsData] = await Promise.all([
        notasCreditoService.getNotasCredito(filters),
        notasCreditoService.getStats(),
      ]);
      setNotas(notasData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: t('comun.error'),
        description: t('listado.errorCarga'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchTerm, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnular = async (id: string) => {
    if (!confirm(t('anular.confirmar'))) return;
    
    const reason = prompt(t('anular.motivo'));
    try {
      const result = await notasCreditoService.anularNotaCredito(id, reason || undefined);
      if (result.success) {
        toast({ title: t('comun.exito'), description: t('anular.hecho') });
        loadData();
      } else {
        toast({ title: t('comun.error'), description: result.error || t('anular.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('comun.error'), description: t('anular.error'), variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const csv = [
      [
        t('listado.columnas.numero'),
        t('listado.columnas.fecha'),
        t('listado.columnas.cliente'),
        t('listado.columnas.facturaOrigen'),
        t('listado.columnas.total'),
        t('listado.columnas.estado'),
      ].join(','),
      ...notas.map(n => 
        [
          n.number,
          formatDate(n.issue_date),
          nombreCliente(n),
          n.related_invoice?.number || '-',
          n.total,
          etiquetaEstado(n.status)
        ].join(',')
      ),
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('listado.archivoExportacion')}_${getToday()}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={t('listado.volver')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('listado.titulo')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('listado.subtitulo')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => router.push('/app/finanzas/facturas-venta')}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('listado.nueva')}
          </Button>
          <Button variant="outline" onClick={handleExport} className="dark:border-gray-700">
            <Download className="h-4 w-4 mr-2" />
            {t('listado.exportar')}
          </Button>
        </div>
      </div>
      <BranchBadge className="mb-3" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('listado.kpis.totalEmitido')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatear(stats.total)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('listado.kpis.esteMes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatear(stats.thisMonth)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('listado.kpis.totalNotas')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.count}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('listado.kpis.enBorrador')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.pending}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('listado.buscar')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder={t('listado.filtroEstado')} />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectItem value="all">{t('listado.filtros.todos')}</SelectItem>
            <SelectItem value="draft">{t('estados.draft')}</SelectItem>
            <SelectItem value="sent">{t('estados.sent')}</SelectItem>
            <SelectItem value="accepted">{t('listado.filtros.aceptada')}</SelectItem>
            <SelectItem value="rejected">{t('estados.rejected')}</SelectItem>
            <SelectItem value="void">{t('estados.void')}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={loadData} className="dark:border-gray-700">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('listado.actualizar')}
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="dark:text-gray-400">{t('listado.columnas.numero')}</TableHead>
                <TableHead className="dark:text-gray-400">{t('listado.columnas.fecha')}</TableHead>
                <TableHead className="dark:text-gray-400">{t('listado.columnas.cliente')}</TableHead>
                <TableHead className="dark:text-gray-400">{t('listado.columnas.facturaOrigen')}</TableHead>
                <TableHead className="dark:text-gray-400 text-right">{t('listado.columnas.total')}</TableHead>
                <TableHead className="dark:text-gray-400">{t('listado.columnas.estado')}</TableHead>
                <TableHead className="dark:text-gray-400 text-right">{t('listado.columnas.acciones')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {t('listado.vacio')}
                  </TableCell>
                </TableRow>
              ) : (
                notas.map((nota) => (
                  <TableRow key={nota.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      <CopyableId
                        label={nota.number}
                        copyValue={nota.number}
                        onClick={() => router.push(`/app/finanzas/notas-credito/${nota.id}`)}
                        iconSize={12}
                      />
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {formatDate(nota.issue_date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {nombreCliente(nota)}
                          </p>
                          {nota.customer?.identification_number && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {nota.customer.identification_number}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {nota.related_invoice ? (
                        <Link 
                          href={`/app/finanzas/facturas-venta/${nota.related_invoice_id}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {nota.related_invoice.number}
                        </Link>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">
                      {formatMoneda(Number(nota.total), paraDocumento((nota as NotaConMoneda).currency))}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[nota.status]} flex items-center gap-1 w-fit`}>
                        {statusIcons[nota.status]}
                        {etiquetaEstado(nota.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('listado.masAcciones', { numero: nota.number })}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <DropdownMenuItem
                            onClick={() => router.push(`/app/finanzas/notas-credito/${nota.id}`)}
                            className="cursor-pointer"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {t('listado.verDetalle')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => imprimirDocumento('nota-credito', nota.id)} className="cursor-pointer">
                            <Printer className="h-4 w-4 mr-2" />
                            {ta('imprimir')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => abrirDocumento('nota-credito', nota.id)} className="cursor-pointer">
                            <FileText className="h-4 w-4 mr-2" />
                            {ta('verPdf')}
                          </DropdownMenuItem>
                          {nota.status !== 'void' && nota.status !== 'accepted' && (
                            <>
                              <DropdownMenuSeparator className="dark:bg-gray-700" />
                              <DropdownMenuItem
                                onClick={() => handleAnular(nota.id)}
                                className="cursor-pointer text-red-600 dark:text-red-400"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                {t('listado.anular')}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
